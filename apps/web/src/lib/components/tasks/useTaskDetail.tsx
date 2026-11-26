"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { FALLBACK_GIT_BASE_BRANCH, taskCanCreatePr } from "@eva/shared";
import { taskPrUrl } from "@/lib/githubPr";
import { canEditTaskText } from "@eva/shared/taskDetail";
import { useTaskSession } from "./useTaskSession";
import type { OwnedSandboxFields } from "@/lib/components/sandbox/useOwnedSession";
import {
  type UseTaskDetailRouting,
  useTaskDetailTab,
  useTaskExecutionControls,
  useTaskSandboxControls,
} from "./useTaskDetailControls";

type TaskRow = FunctionReturnType<typeof api.agentTasks.get> | undefined;
type RepoRow = FunctionReturnType<typeof api.githubRepos.get> | undefined;

/**
 * Read straight off the task row — never mirrored into local state. A mirror
 * had to be re-seeded whenever the row changed, and any render that seeded it
 * before `task` arrived took the repo default instead: that is how the
 * Properties column showed `staging` for a task whose own base branch is
 * `main`, until a reload happened to seed it in the right order. The picker
 * writes through `updateTask`, whose optimistic update patches this same
 * query, so the value still changes the instant it is picked.
 */
function deriveTaskRowFields(
  task: TaskRow,
  repoForTask: RepoRow,
  sandbox: OwnedSandboxFields,
) {
  return {
    baseBranch:
      task?.baseBranch?.trim() ||
      repoForTask?.defaultBaseBranch?.trim() ||
      FALLBACK_GIT_BASE_BRANCH,
    sandboxId: sandbox.sandboxId,
  };
}

/**
 * Every query the task detail reads, in a fixed subscription order. Returns
 * only public fields: `useTaskDetail` spreads the result into its return.
 */
function useTaskDetailQueries(taskId: Id<"agentTasks">) {
  const taskResult = useQuery(api.agentTasks.get, { id: taskId });
  const task = taskResult === null ? null : (taskResult ?? undefined);
  const taskSession = useTaskSession(taskId, task);
  const currentUserId = useQuery(api.auth.me);
  const isOwner = currentUserId === task?.createdBy;
  // One read for both task kinds: the server knows how each one runs.
  const runFacts = useQuery(api.agentTasks.getRunFacts, { taskId });
  const hasActiveRun = runFacts?.hasActiveRun ?? false;
  const hasRuns = runFacts?.hasRuns ?? false;
  const users = useQuery(api.users.listAll);
  const projects = useQuery(
    api.projects.list,
    task?.repoId ? { repoId: task.repoId } : "skip",
  );
  // A project archives with its tasks, so its task is read-only too.
  const project = useQuery(
    api.projects.get,
    task?.projectId ? { id: task.projectId } : "skip",
  );
  const isArchived =
    task?.archivedAt !== undefined || project?.archivedAt !== undefined;
  const allComments = useQuery(api.taskComments.listByTask, { taskId });
  const comments = allComments?.filter((c) => c.authorId);
  const taskActivity = useQuery(api.taskActivity.listByTask, { taskId });
  const repoForTask = useQuery(
    api.githubRepos.get,
    task?.repoId ? { id: task.repoId } : "skip",
  );

  return {
    isLoading: taskResult === undefined,
    isNotFound: taskResult === null,
    task,
    isOwner,
    runFacts,
    hasActiveRun,
    hasRuns,
    isArchived,
    users,
    projects,
    comments,
    taskActivity,
    taskSession,
    ...deriveTaskRowFields(task, repoForTask, taskSession.sandbox),
  };
}

type TaskDetailQueries = ReturnType<typeof useTaskDetailQueries>;

function deriveRunSummary({
  task,
  runFacts,
  hasRuns,
  hasActiveRun,
  isArchived,
  comments,
  users,
  projects,
}: TaskDetailQueries) {
  const status = task?.status;
  const latestPrUrl = taskPrUrl(task, projects);
  const hasTabContent =
    hasRuns || (comments !== undefined && comments.length > 0);
  return {
    status,
    canEditTaskText: !isArchived && canEditTaskText(status, hasActiveRun),
    latestPrUrl,
    latestPrError: runFacts?.latestPrError,
    deploymentStatus: runFacts?.deploymentStatus,
    canCreatePr: taskCanCreatePr({ latestPrUrl, hasRuns, hasActiveRun }),
    showTabsColumn: status !== "todo" || hasTabContent,
    creatorUser: task?.createdBy
      ? users?.find((u) => u._id === task.createdBy)
      : undefined,
  };
}

export function useTaskDetail(
  taskId: Id<"agentTasks">,
  routing?: UseTaskDetailRouting,
) {
  const data = useTaskDetailQueries(taskId);
  const execution = useTaskExecutionControls(taskId);
  const sandbox = useTaskSandboxControls({
    taskId,
    task: data.task,
    taskSession: data.taskSession,
    hasRuns: data.hasRuns,
    routing,
  });
  const tab = useTaskDetailTab(routing);

  // Each part returns only public fields, so the spreads are the API.
  return {
    ...data,
    ...deriveRunSummary(data),
    ...tab,
    ...execution,
    ...sandbox,
    // An archived task opens read-only: no sandbox start.
    canStartSandbox: sandbox.canStartSandbox && !data.isArchived,
    layoutGridClass: "grid-cols-1 md:grid-cols-[1fr_1fr_200px]",
    modalWidthClass: "max-w-[calc(100vw-2rem)] md:max-w-6xl",
  };
}
