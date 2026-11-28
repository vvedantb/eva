import { api, type Id } from "@eva/backend";
import type { useQuery as convexUseQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { ProjectStatus } from "./projectStatus";
import {
  projectStatusFromRows,
  projectTaskNotesByTask,
  type ProjectListStatus,
  type ProjectTaskNotes,
} from "./projectView";

export type ProjectTaskListRow = FunctionReturnType<
  typeof api.agentTasks.listByProject
>[number];

/**
 * The hooks, bound to the app's `useQuery`: the web passes its cached one
 * (`convex-helpers`), the phone the plain `convex/react` one.
 */
export function projectStatusHooks(useQuery: typeof convexUseQuery) {
  function useFailedTaskIds(
    repoId: Id<"githubRepos">,
    rows: ReadonlyArray<ProjectTaskListRow> | undefined,
  ): ReadonlySet<string> | undefined {
    const taskIds = (rows ?? [])
      .filter((row) => row.locked !== true)
      .map((row) => row._id);
    const failed = useQuery(
      api.agentTasks.getTaskIdsWithFailedRun,
      rows === undefined ? "skip" : { repoId, taskIds },
    );
    return failed === undefined ? undefined : new Set<string>(failed);
  }

  function useProjectTaskStatus(
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

  function useProjectListStatuses(
    repoId: Id<"githubRepos">,
    archived = false,
  ): ReadonlyMap<string, ProjectListStatus> | undefined {
    const rows = useQuery(
      api.projects.listStatusesForRepo,
      archived ? { repoId, archived } : { repoId },
    );
    if (rows === undefined) return undefined;
    return new Map(rows.map((row) => [String(row.projectId), row]));
  }

  function useProjectTaskNotes(
    projectId: Id<"projects">,
  ): ReadonlyMap<string, ProjectTaskNotes> {
    const reports = useQuery(api.projects.listTaskReports, { projectId });
    return projectTaskNotesByTask(reports ?? []);
  }

  return { useProjectTaskStatus, useProjectListStatuses, useProjectTaskNotes };
}
