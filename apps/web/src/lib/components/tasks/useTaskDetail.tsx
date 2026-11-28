"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  FALLBACK_GIT_BASE_BRANCH,
  taskCanCreatePr,
  taskPrUrl,
} from "@eva/shared";
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

function useTaskDetailQueries(taskId: Id<"agentTasks">) {
  const taskResult = useQuery(api.agentTasks.get, { id: taskId });
  const task = taskResult === null ? null : (taskResult ?? undefined);
  const taskSession = useTaskSession(taskId, task);
  const runFacts = useQuery(api.agentTasks.getRunFacts, { taskId });
  const hasActiveRun = runFacts?.hasActiveRun ?? false;
  const hasRuns = runFacts?.hasRuns ?? false;
  const users = useQuery(api.users.listAll);
  const projects = useQuery(
    api.projects.list,
    task?.repoId ? { repoId: task.repoId } : "skip",
  );
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
  const latestPrUrl = task
    ? taskPrUrl(
        task,
        projects?.find((project) => project._id === task.projectId)?.prUrl,
      )
    : undefined;
  const hasTabContent =
    hasRuns || (comments !== undefined && comments.length > 0);
  return {
    status,
    canEditTaskText: !isArchived && canEditTaskText(status, hasActiveRun),
    latestPrUrl,
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

  return {
    ...data,
    ...deriveRunSummary(data),
    ...tab,
    ...execution,
    ...sandbox,
    canStartSandbox: sandbox.canStartSandbox && !data.isArchived,
    layoutGridClass: "grid-cols-1 md:grid-cols-[1fr_1fr_200px]",
    modalWidthClass: "max-w-[calc(100vw-2rem)] md:max-w-6xl",
  };
}
