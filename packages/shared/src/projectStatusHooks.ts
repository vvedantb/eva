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

// The project status hooks of the web and the phone: the same queries and the
// same rules (`projectView`), so both apps show one status. A subpath
// (`@eva/shared/projectStatusHooks`), not the root: it is React.

export type ProjectTaskListRow = FunctionReturnType<
  typeof api.agentTasks.listByProject
>[number];

/**
 * The hooks, bound to the app's `useQuery`: the web passes its cached one
 * (`convex-helpers`), the phone the plain `convex/react` one.
 */
export function projectStatusHooks(useQuery: typeof convexUseQuery) {
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
      api.agentTasks.getTaskIdsWithFailedRun,
      rows === undefined ? "skip" : { repoId, taskIds },
    );
    return failed === undefined ? undefined : new Set<string>(failed);
  }

  /**
   * One project's child tasks and its derived status (`projectStatus`): the
   * project screen, overview, task list and Documents tab.
   */
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

  /**
   * Derived status for every project of a repo, keyed by project id: one
   * subscription for the whole list (`listStatusesForRepo`). Undefined while
   * it loads, so rows never jump between sections while the list fills in.
   */
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

  /**
   * Each task's open ask and open reports (`listTaskReports`), keyed by task
   * id: the task list and the coordinator chat's task cards.
   */
  function useProjectTaskNotes(
    projectId: Id<"projects">,
  ): ReadonlyMap<string, ProjectTaskNotes> {
    const reports = useQuery(api.projects.listTaskReports, { projectId });
    return projectTaskNotesByTask(reports ?? []);
  }

  return { useProjectTaskStatus, useProjectListStatuses, useProjectTaskNotes };
}
