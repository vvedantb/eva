import { statSync, watch, type FSWatcher } from "fs";
import { COMMIT_EXCLUDE_PATHSPECS } from "@eva/shared/gitDefaults";
import { ENTITY_ID, ENTITY_ID_FIELD, WORK_DIR } from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { log } from "../utils.js";
import { git } from "./gitExec.js";

/**
 * Reports the branch the sandbox checkout is actually on, plus how much of its
 * work is not on GitHub yet, so the UI can show both live. Deliberately independent of the turn lifecycle: the user can `git
 * checkout` in the Terminal panel with no turn running, and heartbeats only fire
 * while the daemon holds a turn lease.
 */

/** Cheap enough to run on every tick; bounded so a wedged git cannot stall us. */
const GIT_TIMEOUT_MS = 5_000;
/** Backstop for inotify events the kernel dropped (or a worktree pointer file). */
const POLL_INTERVAL_MS = 15_000;
/** A checkout rewrites HEAD several times; wait for it to settle. */
const DEBOUNCE_MS = 300;

export type BranchTarget =
  | { kind: "session"; sessionId: string }
  | { kind: "sessionChat"; chatId: string }
  | { kind: "task"; taskId: string }
  | { kind: "project"; projectId: string };

/**
 * Maps the launcher's `ENTITY_ID_FIELD` / `ENTITY_ID` pair onto the mutation's
 * target union. Null for any other owner (arena runs, automations) — those have
 * no document to report onto.
 */
export function resolveBranchTarget(
  field: string | undefined,
  id: string | undefined,
): BranchTarget | null {
  if (typeof id !== "string" || id.length === 0) return null;
  if (field === "sessionId") return { kind: "session", sessionId: id };
  if (field === "chatId") return { kind: "sessionChat", chatId: id };
  if (field === "taskId") return { kind: "task", taskId: id };
  if (field === "projectId") return { kind: "project", projectId: id };
  return null;
}

/**
 * Detached HEAD: `--abbrev-ref` prints the literal "HEAD", which names no
 * branch — report the short sha so the UI shows where the worktree really is.
 */
export function formatBranch(
  abbrevRef: string,
  shortSha: string,
): string | null {
  const ref = abbrevRef.trim();
  if (ref.length === 0) return null;
  if (ref !== "HEAD") return ref;
  const sha = shortSha.trim();
  return sha.length > 0 ? sha : null;
}

/** Work on the checked-out branch that origin does not have yet. */
export type GitSync = { uncommittedFiles: number; unpushedCommits: number };
export type GitState = { branch: string; sync: GitSync | null };

function sameState(a: GitState, b: GitState): boolean {
  return (
    a.branch === b.branch &&
    a.sync?.uncommittedFiles === b.sync?.uncommittedFiles &&
    a.sync?.unpushedCommits === b.sync?.unpushedCommits
  );
}

/** The state worth sending, or null when nothing changed since the last send. */
export function decideGitStateReport(input: {
  current: GitState | null;
  lastReported: GitState | null;
}): GitState | null {
  if (input.current === null) return null;
  if (input.lastReported !== null && sameState(input.current, input.lastReported)) {
    return null;
  }
  return input.current;
}

function readCurrentBranch(): string | null {
  const abbrev = git(["rev-parse", "--abbrev-ref", "HEAD"], GIT_TIMEOUT_MS);
  if (!abbrev.ok) return null;
  if (abbrev.out.trim() !== "HEAD") return formatBranch(abbrev.out, "");
  const short = git(["rev-parse", "--short", "HEAD"], GIT_TIMEOUT_MS);
  return formatBranch(abbrev.out, short.ok ? short.out : "");
}

/**
 * Counts with the turn-end commit's exclusions, so they match what "Commit &
 * push" would publish. Unpushed is measured against every origin ref: a new
 * branch forked from `origin/main` counts only its own commits. Null when git
 * cannot answer — the branch is still reported.
 */
function readGitSync(): GitSync | null {
  const status = git(
    ["status", "--porcelain", "--", ".", ...COMMIT_EXCLUDE_PATHSPECS],
    GIT_TIMEOUT_MS,
  );
  const ahead = git(
    ["rev-list", "--count", "HEAD", "--not", "--remotes=origin"],
    GIT_TIMEOUT_MS,
  );
  const unpushedCommits = Number(ahead.out);
  if (!status.ok || !ahead.ok || !Number.isSafeInteger(unpushedCommits)) {
    return null;
  }
  const uncommittedFiles =
    status.out.length === 0 ? 0 : status.out.split("\n").length;
  return { uncommittedFiles, unpushedCommits };
}

function readGitState(): GitState | null {
  const branch = readCurrentBranch();
  if (branch === null) return null;
  return { branch, sync: readGitSync() };
}

let target: BranchTarget | null = null;
let lastReported: GitState | null = null;
let pollInterval: NodeJS.Timeout | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let headWatcher: FSWatcher | null = null;
let checkInFlight = false;
let recheckQueued = false;
let started = false;

async function runCheckLoop(): Promise<void> {
  const activeTarget = target;
  if (activeTarget === null) return;
  if (checkInFlight) {
    // A checkout landed mid-send; re-read once the in-flight call settles.
    recheckQueued = true;
    return;
  }
  checkInFlight = true;
  recheckQueued = false;
  try {
    let again = true;
    while (again) {
      again = false;
      const state = decideGitStateReport({
        current: readGitState(),
        lastReported,
      });
      if (state !== null) {
        try {
          await callConvexWithRetry("mutation", "sandboxGit:reportBranch", {
            target: activeTarget,
            branch: state.branch,
            ...(state.sync ? { sync: state.sync } : {}),
          });
          lastReported = state;
        } catch (error) {
          // Leave lastReported alone so the next tick retries this state.
          log(
            "branchWatcher: report failed: " +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }
      if (recheckQueued) {
        recheckQueued = false;
        again = true;
      }
    }
  } finally {
    checkInFlight = false;
  }
}

function scheduleCheck(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runCheckLoop();
  }, DEBOUNCE_MS);
  debounceTimer.unref();
}

function watchHeadIn(gitDir: string): void {
  try {
    // Watch the directory, not `.git/HEAD`: git replaces HEAD by writing a temp
    // file and renaming it, so a watcher on the file follows the dead inode.
    headWatcher = watch(gitDir, (_event, filename) => {
      if (filename !== "HEAD") return;
      scheduleCheck();
    });
    headWatcher.unref();
  } catch (error) {
    log(
      "branchWatcher: fs.watch unavailable, polling only: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

/**
 * Re-reads now instead of on the next poll. Called after the turn-end commit
 * and push, which move refs the HEAD watcher does not see.
 */
export function requestGitStateCheck(): void {
  if (!started) return;
  scheduleCheck();
}

/** Starts the watcher. Idempotent — safe to call from every daemon entry point. */
export function startBranchWatcher(): void {
  if (started) return;
  started = true;
  target = resolveBranchTarget(ENTITY_ID_FIELD, ENTITY_ID);
  if (target === null) {
    log(
      "branchWatcher: disabled — no reportable entity (field=" +
        (ENTITY_ID_FIELD ?? "none") +
        ")",
    );
    return;
  }

  const gitDir = WORK_DIR + "/.git";
  let gitDirIsDirectory = false;
  try {
    gitDirIsDirectory = statSync(gitDir).isDirectory();
  } catch {
    gitDirIsDirectory = false;
  }
  if (gitDirIsDirectory) {
    watchHeadIn(gitDir);
  } else {
    log("branchWatcher: " + gitDir + " is not a directory; polling only");
  }

  pollInterval = setInterval(() => {
    void runCheckLoop();
  }, POLL_INTERVAL_MS);
  // Never keep the process alive: a one-shot run exits as soon as its turn
  // completes, and this is best-effort telemetry.
  pollInterval.unref();

  void runCheckLoop();
}

/** Releases the timers and the inotify handle. */
export function stopBranchWatcher(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (headWatcher) {
    headWatcher.close();
    headWatcher = null;
  }
  target = null;
  lastReported = null;
  started = false;
}
