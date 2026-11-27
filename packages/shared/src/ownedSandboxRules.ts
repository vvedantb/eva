import type { SandboxStatus } from "./sandboxStatus";
import type { TaskStatus } from "./taskMeta";

// When a task's sandbox and git actions are offered, web and phone: the task
// page footer and menu. A project's coordinator is read-only: it offers no
// git actions.

/** Task statuses whose review sandbox can be woken at any time (the preview of the work). */
export const PREVIEW_SANDBOX_ALLOWED_STATUSES: TaskStatus[] = [
  "code_review",
  "business_review",
  "done",
];

/** A task's sandbox can be woken once there is work to look at: a review status, or a To Do task that has run. */
export function taskCanStartSandbox(
  status: TaskStatus | undefined,
  hasRuns: boolean,
): boolean {
  return (
    status !== undefined &&
    (PREVIEW_SANDBOX_ALLOWED_STATUSES.includes(status) ||
      (status === "todo" && hasRuns))
  );
}

/** Resolve Conflicts: a task in review with no run going. */
export function taskCanResolveConflicts(
  status: TaskStatus | undefined,
  hasActiveRun: boolean,
): boolean {
  return (
    !hasActiveRun && (status === "code_review" || status === "business_review")
  );
}

/** Create PR: a task that has run, with no run going and no PR yet (the task's, or its project's). */
export function taskCanCreatePr({
  latestPrUrl,
  hasRuns,
  hasActiveRun,
}: {
  latestPrUrl: string | undefined;
  hasRuns: boolean;
  hasActiveRun: boolean;
}): boolean {
  return !latestPrUrl && hasRuns && !hasActiveRun;
}

/**
 * Whether a host may auto-wake its sandbox (web Preview; the setting and a
 * visible tab still gate it). Session, quick task, project and project task
 * share this rule: the sandbox is closed with one to resume, its last start
 * did not fail (a retry stays manual), the host would allow a Start (not
 * read-only), and nothing owns it. `isBusy` undefined is still loading, which
 * counts as busy: never wake under a live run or turn.
 */
export function sandboxAutoWakeEligible({
  status,
  sandboxId,
  sandboxError,
  canStart,
  isBusy,
}: {
  status: SandboxStatus | undefined;
  sandboxId: string | undefined;
  /** The last start's failure; set and non-empty means it failed. */
  sandboxError: string | undefined;
  canStart: boolean;
  /** A run or turn owns the sandbox; undefined while that loads. */
  isBusy: boolean | undefined;
}): boolean {
  return (
    status === "closed" &&
    sandboxId !== undefined &&
    (sandboxError ?? "") === "" &&
    canStart &&
    isBusy === false
  );
}

/**
 * The PR a task links to: its own, else (an old project task that never
 * opened one) its project's. Every task opens its own PR on its own branch,
 * so the task's PR is the one that holds its work. One rule for the web, the
 * phone, the backend and MCP.
 */
export function taskPrUrl(
  task: { prUrl?: string },
  projectPrUrl: string | undefined,
): string | undefined {
  return task.prUrl ?? projectPrUrl;
}
