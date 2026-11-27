import { statSync, watch } from "fs";
import { COMMIT_EXCLUDE_PATHSPECS } from "@eva/shared/gitDefaults";
import { ENTITY_ID, ENTITY_ID_FIELD, WORK_DIR } from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { log } from "../utils.js";
import { git, readCurrentBranch } from "./gitExec.js";

const GIT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 15_000;
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

type GitSync = { uncommittedFiles: number; unpushedCommits: number };
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

function readWatchedBranch(): string | null {
  const abbrev = readCurrentBranch({ timeoutMs: GIT_TIMEOUT_MS });
  if (abbrev !== "HEAD") return formatBranch(abbrev, "");
  const short = git(["rev-parse", "--short", "HEAD"], {
    timeoutMs: GIT_TIMEOUT_MS,
  });
  return formatBranch(abbrev, short.ok ? short.stdout : "");
}

function readGitSync(): GitSync | null {
  const status = git(
    ["status", "--porcelain", "--", ".", ...COMMIT_EXCLUDE_PATHSPECS],
    { timeoutMs: GIT_TIMEOUT_MS },
  );
  const ahead = git(
    ["rev-list", "--count", "HEAD", "--not", "--remotes=origin"],
    { timeoutMs: GIT_TIMEOUT_MS },
  );
  const unpushedCommits = Number(ahead.stdout);
  if (!status.ok || !ahead.ok || !Number.isSafeInteger(unpushedCommits)) {
    return null;
  }
  const uncommittedFiles =
    status.stdout.length === 0 ? 0 : status.stdout.split("\n").length;
  return { uncommittedFiles, unpushedCommits };
}

function readGitState(): GitState | null {
  const branch = readWatchedBranch();
  if (branch === null) return null;
  return { branch, sync: readGitSync() };
}

let target: BranchTarget | null = null;
let lastReported: GitState | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let checkInFlight = false;
let recheckQueued = false;
let started = false;

async function runCheckLoop(): Promise<void> {
  const activeTarget = target;
  if (activeTarget === null) return;
  if (checkInFlight) {
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
    const headWatcher = watch(gitDir, (_event, filename) => {
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

  const pollInterval = setInterval(() => {
    void runCheckLoop();
  }, POLL_INTERVAL_MS);
  pollInterval.unref();

  void runCheckLoop();
}
