import { isProjectBuilding, type Doc } from "@eva/backend";
import { isLivePrState } from "./prState";
import type { TaskStatus } from "./taskMeta";

// When a task's or a project's sandbox and git actions are offered, web and
// phone: the task page footer and menu, the project page header.

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

type ProjectGitFields = Pick<Doc<"projects">, "phase" | "prState"> &
  Parameters<typeof isProjectBuilding>[0];

/** Create PR for a project: no live PR (a merged one stays as history), no build running, in progress or business review. */
export function projectCanCreatePr(project: ProjectGitFields): boolean {
  return (
    !isLivePrState(project.prState) &&
    !isProjectBuilding(project) &&
    (project.phase === "business_review" || project.phase === "in_progress")
  );
}

/** Resolve Conflicts for a project: a live PR, no build running, in business or code review. */
export function projectCanResolveConflicts(project: ProjectGitFields): boolean {
  return (
    isLivePrState(project.prState) &&
    !isProjectBuilding(project) &&
    (project.phase === "business_review" || project.phase === "code_review")
  );
}
