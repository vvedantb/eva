import { api, type Id } from "@eva/backend";
import { withHomeRepos } from "@eva/shared";
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
 * Every project the caller can open, each with its home repo, and their
 * derived statuses by project id (`listAccessible`), as the web root
 * Projects pages. Undefined while either query loads.
 */
export function useAccessibleProjects() {
  const data = useQuery(api.projects.listAccessible, {});
  const repos = useQuery(api.githubRepos.list, {});
  if (data === undefined || repos === undefined) return undefined;
  const statuses: ReadonlyMap<string, ProjectListStatus> = new Map(data.statuses.map((row) => [String(row.projectId), row]));
  return { repos, rows: withHomeRepos(data.projects, repos), statuses };
}

/**
 * Each task's open ask and open reports (`listTaskReports`), keyed by task
 * id, for the project task list.
 */
export function useProjectTaskNotes(projectId: Id<"projects">): ReadonlyMap<string, ProjectTaskNotes> {
  const reports = useQuery(api.projects.listTaskReports, { projectId });
  return projectTaskNotesByTask(reports ?? []);
}
