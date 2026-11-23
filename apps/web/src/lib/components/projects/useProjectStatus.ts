import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import {
  projectStatusFromRows,
  projectTaskNotesByTask,
  type ProjectListStatus,
  type ProjectTaskNotes,
} from "@eva/shared/projectView";

export type ProjectTaskListRow = FunctionReturnType<
  typeof api.agentTasks.listByProject
>[number];

/**
 * The tasks whose latest run failed, of the rows the caller can open. One
 * query for every project on the page: the home repo is the access scope.
 */
function useFailedTaskIds(
  repoId: Id<"githubRepos">,
  rows: ReadonlyArray<ProjectTaskListRow> | undefined,
): ReadonlySet<string> | undefined {
  const taskIds = (rows ?? [])
    .filter((row) => row.locked !== true)
    .map((row) => row._id);
  const failed = useQuery(
    api.agentRuns.getTaskIdsWithLatestRunError,
    rows === undefined ? "skip" : { repoId, taskIds },
  );
  return failed === undefined ? undefined : new Set<string>(failed);
}

/**
 * One project's child tasks and its derived status (`projectStatus`). The
 * project page, overview, task list and Documents tab all read it.
 */
export function useProjectTaskStatus(
  projectId: Id<"projects">,
  repoId: Id<"githubRepos">,
) {
  const tasks = useQuery(api.agentTasks.listByProject, { projectId });
  const failedTaskIds = useFailedTaskIds(repoId, tasks);
  const status: ProjectStatus | undefined =
    tasks === undefined
      ? undefined
      : projectStatusFromRows(tasks, failedTaskIds ?? new Set());
  return { tasks, failedTaskIds: failedTaskIds ?? new Set<string>(), status };
}

/**
 * Derived status for every project of a repo, keyed by project id: one
 * subscription for the whole list (`listStatusesForRepo`). Undefined while
 * it loads, so cards never jump between columns while the page fills in.
 */
export function useProjectListStatuses(
  repoId: Id<"githubRepos">,
): ReadonlyMap<string, ProjectListStatus> | undefined {
  const rows = useQuery(api.projects.listStatusesForRepo, { repoId });
  if (rows === undefined) return undefined;
  return new Map(rows.map((row) => [String(row.projectId), row]));
}

/**
 * Each task's open ask and open reports (`listTaskReports`), keyed by task
 * id. The task list and the coordinator chat's task cards both read it.
 */
export function useProjectTaskNotes(
  projectId: Id<"projects">,
): ReadonlyMap<string, ProjectTaskNotes> {
  const reports = useQuery(api.projects.listTaskReports, { projectId });
  return projectTaskNotesByTask(reports ?? []);
}
