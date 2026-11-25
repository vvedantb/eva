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
  runCount,
  hasActiveRun,
}: {
  latestPrUrl: string | undefined;
  runCount: number;
  hasActiveRun: boolean;
}): boolean {
  return !latestPrUrl && runCount > 0 && !hasActiveRun;
}
