import { api, type Id } from "@eva/backend";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import {
  projectStatusFromRows,
  projectTaskNotesByTask,
  type ProjectListStatus,
  type ProjectTaskNotes,
} from "@eva/shared/projectView";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

// The web `useProjectStatus.ts` on the phone: the same queries, the same
// shared rules (`@eva/shared/projectView`), so both apps show one status.

export type ProjectTaskListRow = FunctionReturnType<typeof api.agentTasks.listByProject>[number];

/** The tasks whose latest run failed, of the rows the caller can open. The home repo is the access scope. */
function useFailedTaskIds(
  repoId: Id<"githubRepos">,
  rows: ReadonlyArray<ProjectTaskListRow> | undefined,
): ReadonlySet<string> | undefined {
  const taskIds = (rows ?? []).filter((row) => row.locked !== true).map((row) => row._id);
  const failed = useQuery(api.agentRuns.getTaskIdsWithLatestRunError, rows === undefined ? "skip" : { repoId, taskIds });
  return failed === undefined ? undefined : new Set<string>(failed);
}

/** One project's child tasks and its derived status. The project screen, overview and task list read it. */
export function useProjectTaskStatus(projectId: Id<"projects">, repoId: Id<"githubRepos">) {
  const tasks = useQuery(api.agentTasks.listByProject, { projectId });
  const failedTaskIds = useFailedTaskIds(repoId, tasks);
  const status: ProjectStatus | undefined =
    tasks === undefined ? undefined : projectStatusFromRows(tasks, failedTaskIds ?? new Set());
  return { tasks, failedTaskIds: failedTaskIds ?? new Set<string>(), status };
}

/**
 * Derived status for every project of a repo, keyed by project id: one
 * subscription for the whole list (`listStatusesForRepo`). Undefined while
 * it loads, so rows never jump between sections while the list fills in.
 */
export function useProjectListStatuses(repoId: Id<"githubRepos">): ReadonlyMap<string, ProjectListStatus> | undefined {
  const rows = useQuery(api.projects.listStatusesForRepo, { repoId });
  if (rows === undefined) return undefined;
  return new Map(rows.map((row) => [String(row.projectId), row]));
}

/**
 * Each task's open ask and open reports (`listTaskReports`), keyed by task
 * id, for the project task list.
 */
export function useProjectTaskNotes(projectId: Id<"projects">): ReadonlyMap<string, ProjectTaskNotes> {
  const reports = useQuery(api.projects.listTaskReports, { projectId });
  return projectTaskNotesByTask(reports ?? []);
}

/**
 * True when the reader is a viewer of the project (`projects.get`
 * `callerRole`): they read everything and file feedback, but never chat,
 * approve, run or change settings. False without a project and while it
 * loads, so nothing flashes read-only for a contributor.
 */
export function useIsProjectViewer(projectId: Id<"projects"> | undefined): boolean {
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip");
  return project?.callerRole === "viewer";
}
