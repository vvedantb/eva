"use client";

import { useElapsedSeconds } from "@eva/ui";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { taskPrUrl } from "@/lib/githubPr";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import {
  canEditTaskText,
  type TaskDetailTab,
} from "./_components/task-detail-constants";
import { taskRunStreamingEntityId } from "./firstRunChatTurn";
import {
  useTaskDetailTab,
  useTaskExecutionControls,
  useTaskSandboxControls,
} from "./useTaskDetailControls";

type QuickTaskDetailRouting = {
  detailTab: TaskDetailTab;
  onDetailTabChange: (tab: TaskDetailTab) => void;
  onOpenSandboxView: (sandboxTab: TaskRouteSandboxTab) => void;
};

type QuickTaskSandboxRouting = {
  sandboxTab: TaskRouteSandboxTab;
  onSandboxTabChange: (tab: TaskRouteSandboxTab) => void;
  onExitSandboxView: () => void;
  /** Opens Files tab with `?file=` set (chat file chips). */
  onOpenFile: (path: string) => void;
  /** Opens Review diffs; optional repo-relative path scrolls to that file. */
  onViewDiff: (repoRelativePath?: string) => void;
};

type ProjectTaskDetailRouting = {
  detailTab: TaskDetailTab;
  onDetailTabChange: (tab: TaskDetailTab) => void;
};

export type UseTaskDetailRouting =
  | { mode: "quick-detail"; quick: QuickTaskDetailRouting }
  | { mode: "quick-sandbox"; quick: QuickTaskSandboxRouting }
  | { mode: "project-detail"; project: ProjectTaskDetailRouting };

/**
 * Read straight off the task row — never mirrored into local state. A mirror
 * had to be re-seeded whenever the row changed, and any render that seeded it
 * before `task` arrived took the repo default instead: that is how the
 * Properties column showed `staging` for a task whose own base branch is
 * `main`, until a reload happened to seed it in the right order. The picker
 * writes through `updateTask`, whose optimistic update patches this same
 * query, so the value still changes the instant it is picked.
 */
function resolveBaseBranch(
  fromTask: string | undefined,
  fromRepo: string | undefined,
) {
  return fromTask?.trim() || fromRepo?.trim() || FALLBACK_GIT_BASE_BRANCH;
}

function resolveDevServerCommandLabel(
  fromTask: string | undefined,
  fromRepo: string | undefined,
) {
  return (
    fromTask?.trim() ||
    fromRepo?.trim() ||
    "Auto-detected from package.json (e.g. pnpm run dev)"
  );
}

/**
 * Every query the task detail reads, in a fixed subscription order. Returns
 * only public fields: `useTaskDetail` spreads the result into its return.
 */
function useTaskDetailQueries(taskId: Id<"agentTasks">) {
  const taskResult = useQuery(api.agentTasks.get, { id: taskId });
  const task = taskResult === null ? null : (taskResult ?? undefined);
  const currentUserId = useQuery(api.auth.me);
  const isOwner = currentUserId === task?.createdBy;
  const isBlocked = useQuery(api.taskDependencies.isBlocked, { taskId });
  const runs = useQuery(api.agentRuns.listByTask, { taskId });
  const hasActiveRun = Boolean(
    runs?.some((run) => run.status === "queued" || run.status === "running"),
  );
  const hasRuns = (runs?.length ?? 0) > 0;
  const isProjectTask = task?.projectId !== undefined;
  const activeRun = runs?.find((run) => run.status === "running");
  const activeRunElapsed = useElapsedSeconds(
    activeRun?.startedAt,
    Boolean(activeRun),
  );
  const streaming = useQuery(
    api.streaming.get,
    activeRun ? { entityId: taskRunStreamingEntityId(activeRun._id) } : "skip",
  );
  const users = useQuery(api.users.listAll);
  const projects = useQuery(
    api.projects.list,
    task?.repoId ? { repoId: task.repoId } : "skip",
  );
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
    isBlocked,
    runs,
    hasActiveRun,
    hasRuns,
    isProjectTask,
    activeRun,
    activeRunElapsed,
    streaming,
    users,
    projects,
    comments,
    taskActivity,
    baseBranch: resolveBaseBranch(
      task?.baseBranch,
      repoForTask?.defaultBaseBranch,
    ),
    devServerCommandLabel: resolveDevServerCommandLabel(
      task?.devCommand,
      repoForTask?.devCommand,
    ),
    sandboxId: task?.sandboxId,
    reviewTaskSandboxStatus: task?.reviewTaskSandboxStatus,
  };
}

type TaskDetailQueries = ReturnType<typeof useTaskDetailQueries>;

function deriveRunSummary({
  task,
  runs,
  hasActiveRun,
  comments,
  users,
  projects,
}: TaskDetailQueries) {
  const status = task?.status;
  const latestPrUrl = taskPrUrl(task, projects);
  const hasTabContent =
    (runs !== undefined && runs.length > 0) ||
    (comments !== undefined && comments.length > 0);
  return {
    status,
    canEditTaskText: canEditTaskText(status, hasActiveRun),
    latestPrUrl,
    latestPrError: runs?.find((r) => r.prError)?.prError,
    latestDeployment: runs?.find((r) => r.deploymentStatus),
    canCreatePr: !latestPrUrl && (runs?.length ?? 0) > 0 && !hasActiveRun,
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
    hasRuns: data.hasRuns,
    routing,
    setExecutionError: execution.setExecutionError,
  });
  const tab = useTaskDetailTab(routing);

  // Each part returns only public fields, so the spreads are the API.
  return {
    ...data,
    ...deriveRunSummary(data),
    ...tab,
    ...execution,
    ...sandbox,
    isActivityBusy: data.hasActiveRun,
    layoutGridClass: "grid-cols-1 md:grid-cols-[1fr_1fr_200px]",
    modalWidthClass: "max-w-[calc(100vw-2rem)] md:max-w-6xl",
  };
}
