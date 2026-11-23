import { api, type Id } from "@eva/backend";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import { projectStatusFromRows } from "@eva/shared/projectView";
import { useQueries, useQuery } from "convex/react";
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

type TaskListQueries = Record<string, { query: typeof api.agentTasks.listByProject; args: { projectId: Id<"projects"> } }>;

/**
 * The `useQueries` request maps, cached by their project ids: `useQueries`
 * resubscribes whenever its argument changes identity, and a render-local
 * memo does not hold across a render-phase retry (see `perRepoQueryCache`).
 */
const taskListQueryCache = new Map<string, TaskListQueries>();

function taskListQueries(projectIds: ReadonlyArray<Id<"projects">>): TaskListQueries {
  const key = projectIds.join(",");
  const cached = taskListQueryCache.get(key);
  if (cached) return cached;
  const queries: TaskListQueries = Object.fromEntries(
    projectIds.map((projectId) => [projectId, { query: api.agentTasks.listByProject, args: { projectId } }]),
  );
  taskListQueryCache.set(key, queries);
  return queries;
}

/** A `useQueries` result: an error reads as still loading. */
function listedTasks(result: ProjectTaskListRow[] | Error | undefined): ProjectTaskListRow[] | undefined {
  return result === undefined || result instanceof Error ? undefined : result;
}

/**
 * Derived status for every project in a list, keyed by project id. Undefined
 * until every project's tasks have loaded, so rows never jump between
 * sections while the list fills in.
 */
export function useProjectStatuses(
  repoId: Id<"githubRepos">,
  projectIds: ReadonlyArray<Id<"projects">> | undefined,
): ReadonlyMap<string, ProjectStatus> | undefined {
  const results = useQueries(taskListQueries(projectIds ?? []));
  const rowsByProject = (projectIds ?? []).map((projectId): [Id<"projects">, ProjectTaskListRow[] | undefined] => [
    projectId,
    listedTasks(results[projectId]),
  ]);
  const loaded = projectIds !== undefined && rowsByProject.every(([, rows]) => rows !== undefined);
  const allRows = loaded ? rowsByProject.flatMap(([, rows]) => rows ?? []) : undefined;
  const failedTaskIds = useFailedTaskIds(repoId, allRows);
  if (!loaded || failedTaskIds === undefined) return undefined;
  return new Map(rowsByProject.map(([projectId, rows]) => [String(projectId), projectStatusFromRows(rows ?? [], failedTaskIds)]));
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
