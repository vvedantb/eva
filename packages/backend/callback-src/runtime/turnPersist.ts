import { spawnSync } from "child_process";
import { REQUIRE_TASK_COMMIT, RUN_ID, WORK_DIR } from "../config.js";
import { log } from "../utils.js";

const GIT_STEP_TIMEOUT_MS = 20_000;
const PUSH_TIMEOUT_MS = 60_000;

// Media exclusions mirror the agent-facing commit convention in
// convex/_sessions/prompts.ts — captures are chat deliverables, never commits.
const COMMIT_ADD_ARGS = [
  "add",
  "-A",
  "--",
  ":!*.png",
  ":!*.jpg",
  ":!*.jpeg",
  ":!*.gif",
  ":!*.webp",
  ":!*.webm",
  ":!*.mp4",
  ":!*.mov",
  ":!screenshots/",
  ":!recordings/",
  ":!plan.md",
];

function git(
  args: string[],
  timeoutMs: number = GIT_STEP_TIMEOUT_MS,
): { ok: boolean; out: string } {
  const result = spawnSync("git", ["-C", WORK_DIR, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const out = ((result.stdout || "") + (result.stderr || "")).trim();
  return { ok: result.status === 0, out };
}

type BranchSyncResult =
  | { status: "ready"; remoteExists: boolean }
  | { status: "failed" };

/**
 * Keep in sync with `rewrittenBranchIsOwnHistory` in
 * convex/_sandbox_runtime/divergedPublish.ts: the local branch rewrote its own
 * history exactly when its reflog holds the remote tip. Any other remote tip
 * was pushed by someone else and is merged, whatever it touched.
 */
function localBranchRewroteOwnHistory(branch: string, remoteRef: string): boolean {
  const remoteTip = git(["rev-parse", "--verify", remoteRef]);
  const reflog = git(["reflog", "show", "--format=%H", `refs/heads/${branch}`]);
  if (!remoteTip.ok || !reflog.ok || remoteTip.out.length === 0) return false;
  return reflog.out
    .split("\n")
    .map((line) => line.trim())
    .includes(remoteTip.out);
}

function isMissingRemoteRef(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("couldn't find remote ref") ||
    lower.includes("could not find remote ref")
  );
}

function isNonFastForwardPush(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("non-fast-forward") ||
    lower.includes("fetch first") ||
    (lower.includes("[rejected]") && lower.includes("failed to push"))
  );
}

/** Refreshes and safely incorporates the exact branch tip before pushing. */
function synchronizeForPush(branch: string): BranchSyncResult {
  const remoteRef = `refs/remotes/origin/${branch}`;
  const fetch = git(
    [
      "fetch",
      "--no-tags",
      "origin",
      `+refs/heads/${branch}:${remoteRef}`,
    ],
    PUSH_TIMEOUT_MS,
  );
  if (!fetch.ok) {
    if (isMissingRemoteRef(fetch.out)) {
      git(["update-ref", "-d", remoteRef]);
      return { status: "ready", remoteExists: false };
    }
    log(`persistTurnWork: fetch failed: ${fetch.out.slice(0, 200)}`);
    return { status: "failed" };
  }

  const divergence = git([
    "rev-list",
    "--left-right",
    "--count",
    `${remoteRef}...refs/heads/${branch}`,
  ]);
  if (!divergence.ok) {
    log(
      `persistTurnWork: divergence check failed: ${divergence.out.slice(0, 200)}`,
    );
    return { status: "failed" };
  }
  if (/^0\s+\d+$/.test(divergence.out)) {
    return { status: "ready", remoteExists: true };
  }
  if (/^[1-9]\d*\s+0$/.test(divergence.out)) {
    const fastForward = git(["merge", "--ff-only", remoteRef]);
    if (fastForward.ok) {
      return { status: "ready", remoteExists: true };
    }
    log(
      `persistTurnWork: fast-forward failed: ${fastForward.out.slice(0, 200)}`,
    );
    return { status: "failed" };
  }
  if (/^[1-9]\d*\s+[1-9]\d*$/.test(divergence.out)) {
    // Merge, not rebase: a turn that merged the base branch in makes every
    // base commit since the fork local-only, and a rebase replays all of them
    // onto the remote tip (see synchronizeBranchForPublish in
    // _sandbox_runtime/git.ts for the prod case this cost us).
    // Skip that merge when the local branch rewrote its own history (task
    // 231): merging the old tip back in conflicts only inside publish, and the
    // workflow's publish step replaces origin with a leased push instead.
    if (localBranchRewroteOwnHistory(branch, remoteRef)) {
      log(
        `persistTurnWork: skipped merge — local branch rewrote its own history vs origin/${branch}; left to the workflow publish`,
      );
      return { status: "failed" };
    }
    const merge = git(["merge", "--no-edit", remoteRef], PUSH_TIMEOUT_MS);
    if (merge.ok) {
      return { status: "ready", remoteExists: true };
    }
    git(["merge", "--abort"]);
    log(`persistTurnWork: merge failed: ${merge.out.slice(0, 200)}`);
    return { status: "failed" };
  }
  log(`persistTurnWork: unexpected divergence: ${divergence.out}`);
  return { status: "failed" };
}

/** True when every commit reachable from HEAD is already in `exclusion`. */
function tipAlreadyPublished(exclusion: readonly string[]): boolean {
  const unpushed = git(["rev-list", "--count", "HEAD", "--not", ...exclusion]);
  return unpushed.ok && unpushed.out === "0";
}

/**
 * Makes the turn's work durable BEFORE the completion mutation is posted:
 * commits any uncommitted changes (safety net for agents that skipped the
 * prompt's commit convention) and pushes unpushed commits to origin.
 *
 * Why here and not the workflow's post-completion push step: the sandbox VM
 * can die at any moment (provider runtime cap, OOM, platform stop) and a hard
 * death takes no snapshot — the next resume rolls the filesystem back to the
 * pre-turn snapshot. Anything not on origin at that moment is erased. Session
 * 53 and task 213 (6 Aug 2026) both lost completed turns to exactly that
 * window. Once this has run, "turn completed" implies "work is on origin".
 *
 * Deliberately skipped for task runs (RUN_ID / REQUIRE_TASK_COMMIT): the run
 * workflow owns commit semantics there — the commit gate must keep failing
 * agents that did not commit, and the run's own push/PR steps follow.
 * Only ever acts on eva-owned branches (`eva/…`); never main or a base branch.
 * Best-effort throughout: failure must never fail the turn.
 */
export function persistTurnWork(): void {
  if (REQUIRE_TASK_COMMIT || RUN_ID) return;
  const startedAt = Date.now();

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok || !branch.out.startsWith("eva/")) {
    if (branch.ok && branch.out) {
      log(`persistTurnWork: skipped — branch "${branch.out}" is not eva-owned`);
    }
    return;
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty.ok && dirty.out.length > 0) {
    git(COMMIT_ADD_ARGS);
    const staged = git(["diff", "--cached", "--quiet"]);
    if (!staged.ok) {
      const commit = git([
        "commit",
        "-m",
        "task: checkpoint uncommitted work at turn end",
      ]);
      log(
        `persistTurnWork: auto-commit ${commit.ok ? "created" : "failed: " + commit.out.slice(0, 200)}`,
      );
    }
  }

  // Cheap local answer first: synthetic turns finalize on every background-agent
  // continuation, and the common case is a clean tree whose tip the tracking ref
  // already contains. The tracking ref only ever lags behind origin, so a zero
  // count here means origin genuinely has HEAD — no fetch or push needed.
  if (tipAlreadyPublished([`refs/remotes/origin/${branch.out}`])) return;

  // The exact remote branch is refreshed below before the ahead-of-remote gate
  // and push, so a resumed sandbox cannot publish from a stale tracking ref.
  // Fully-qualified refspec, both sides. `HEAD` resolves through whatever the
  // branch currently points at and a bare name goes through the upstream, so
  // either could aim at the base branch; this names the exact ref to update and
  // cannot resolve anywhere else.
  const refspec = `refs/heads/${branch.out}:refs/heads/${branch.out}`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const sync = synchronizeForPush(branch.out);
    if (sync.status === "failed") return;

    // Chat-only turns have nothing to publish. Once the branch exists, compare
    // to that exact ref; otherwise compare against all fetched origin refs.
    const exclusion = sync.remoteExists
      ? [`refs/remotes/origin/${branch.out}`]
      : ["--remotes=origin"];
    if (tipAlreadyPublished(exclusion)) return;

    const push = git(["push", "origin", refspec], PUSH_TIMEOUT_MS);
    if (push.ok) {
      log(
        `persistTurnWork: push ok branch=${branch.out} in ${Date.now() - startedAt}ms`,
      );
      return;
    }
    if (attempt < 2 && isNonFastForwardPush(push.out)) {
      log(
        `persistTurnWork: remote moved during push; refetching branch=${branch.out}`,
      );
      continue;
    }
    log(
      `persistTurnWork: push failed: ${push.out.slice(0, 200)} branch=${branch.out} in ${Date.now() - startedAt}ms`,
    );
    return;
  }
}
