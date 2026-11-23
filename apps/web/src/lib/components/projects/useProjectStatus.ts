import { useQueries } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import { projectStatusFromRows } from "@eva/shared/projectView";

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

/** A `useQueries` result: an error reads as still loading. */
function listedTasks(
  result: ProjectTaskListRow[] | Error | undefined,
): ProjectTaskListRow[] | undefined {
  return result === undefined || result instanceof Error ? undefined : result;
}

/**
 * Derived status for every project on a list page, keyed by project id.
 * Undefined until every project's tasks have loaded, so cards never jump
 * between columns while the page fills in.
 */
export function useProjectStatuses(
  repoId: Id<"githubRepos">,
  projectIds: ReadonlyArray<Id<"projects">> | undefined,
): ReadonlyMap<string, ProjectStatus> | undefined {
  // Keyed by a joined id string so the compiler only rebuilds the query map
  // (and `useQueries` only resubscribes) when the set of projects changes.
  const idsKey = (projectIds ?? []).join(" ");
  const queries = Object.fromEntries(
    (idsKey ? idsKey.split(" ") : []).map((projectId) => [
      projectId,
      { query: api.agentTasks.listByProject, args: { projectId } },
    ]),
  );
  const results = useQueries(queries);
  const rowsByProject = (projectIds ?? []).map(
    (projectId): [Id<"projects">, ProjectTaskListRow[] | undefined] => [
      projectId,
      listedTasks(results[projectId]),
    ],
  );
  const loaded =
    projectIds !== undefined &&
    rowsByProject.every(([, rows]) => rows !== undefined);
  const allRows = loaded
    ? rowsByProject.flatMap(([, rows]) => rows ?? [])
    : undefined;
  const failedTaskIds = useFailedTaskIds(repoId, allRows);
  if (!loaded || failedTaskIds === undefined) return undefined;
  return new Map(
    rowsByProject.map(([projectId, rows]) => [
      String(projectId),
      projectStatusFromRows(rows ?? [], failedTaskIds),
    ]),
  );
}
