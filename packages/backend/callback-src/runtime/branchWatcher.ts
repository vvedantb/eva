import { statSync, watch, type FSWatcher } from "fs";
import { ENTITY_ID, ENTITY_ID_FIELD, WORK_DIR } from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { log } from "../utils.js";
import { git } from "./gitExec.js";

/**
 * Reports the branch the sandbox checkout is actually on, so the UI can show it
 * live. Deliberately independent of the turn lifecycle: the user can `git
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

/** The branch worth sending, or null when nothing changed since the last send. */
export function decideBranchReport(input: {
  current: string | null;
  lastReported: string | null;
}): string | null {
  if (input.current === null) return null;
  if (input.current === input.lastReported) return null;
  return input.current;
}

function readCurrentBranch(): string | null {
  const abbrev = git(["rev-parse", "--abbrev-ref", "HEAD"], GIT_TIMEOUT_MS);
  if (!abbrev.ok) return null;
  if (abbrev.out.trim() !== "HEAD") return formatBranch(abbrev.out, "");
  const short = git(["rev-parse", "--short", "HEAD"], GIT_TIMEOUT_MS);
  return formatBranch(abbrev.out, short.ok ? short.out : "");
}

let target: BranchTarget | null = null;
let lastReported: string | null = null;
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
      const branch = decideBranchReport({
        current: readCurrentBranch(),
        lastReported,
      });
      if (branch !== null) {
        try {
          await callConvexWithRetry("mutation", "sandboxGit:reportBranch", {
            target: activeTarget,
            branch,
          });
          lastReported = branch;
        } catch (error) {
          // Leave lastReported alone so the next tick retries this branch.
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
