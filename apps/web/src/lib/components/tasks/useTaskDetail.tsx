"use client";

import { toast, useElapsedSeconds } from "@eva/ui";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { useState } from "react";
import {
  convexErrorPresentation,
  type ConvexErrorPresentation,
} from "@/lib/utils/convexErrorMessage";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import type { SandboxSurface } from "@/lib/components/sandbox/SandboxSurfaceTabs";
import {
  canEditTaskText,
  type TaskDetailTab,
} from "./_components/task-detail-constants";

const PREVIEW_SANDBOX_ALLOWED_STATUSES = [
  "code_review",
  "business_review",
  "done",
];

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
};

type ProjectTaskDetailRouting = {
  detailTab: TaskDetailTab;
  onDetailTabChange: (tab: TaskDetailTab) => void;
};

export type UseTaskDetailRouting =
  | { mode: "quick-detail"; quick: QuickTaskDetailRouting }
  | { mode: "quick-sandbox"; quick: QuickTaskSandboxRouting }
  | { mode: "project-detail"; project: ProjectTaskDetailRouting };

export function useTaskDetail(
  taskId: Id<"agentTasks">,
  routing?: UseTaskDetailRouting,
) {
  const taskResult = useQuery(api.agentTasks.get, { id: taskId });
  const task = taskResult === null ? null : (taskResult ?? undefined);
  const currentUserId = useQuery(api.auth.me);
  const isOwner = currentUserId === task?.createdBy;
  const isBlocked = useQuery(api.taskDependencies.isBlocked, { taskId });
  const runs = useQuery(api.agentRuns.listByTask, { taskId });
  const hasActiveRun = runs?.some(
    (run) => run.status === "queued" || run.status === "running",
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
    activeRun ? { entityId: `task-run-${activeRun._id}` } : "skip",
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

  const startExecution = useMutation(api.agentTasks.startExecution);
  const cancelExecution = useMutation(api.taskWorkflow.cancelExecution);
  const startTaskSandboxMutation = useMutation(api.agentTasks.startTaskSandbox);
  const stopTaskSandboxMutation = useMutation(api.agentTasks.stopTaskSandbox);
  const retryStartupCommandsMutation = useMutation(
    api.agentTasks.retryStartupCommands,
  );
  const runDevServerMutation = useMutation(api.agentTasks.runDevServer);
  const runBackgroundCommandsMutation = useMutation(
    api.agentTasks.runBackgroundCommands,
  );
  const createTaskPrAction = useAction(api.taskWorkflowActions.createTaskPr);

  const [baseBranch, setBaseBranch] = useState(FALLBACK_GIT_BASE_BRANCH);
  const derivedBaseBranch =
    task?.baseBranch?.trim() ||
    repoForTask?.defaultBaseBranch?.trim() ||
    FALLBACK_GIT_BASE_BRANCH;
  const [prevDerivedBaseBranch, setPrevDerivedBaseBranch] =
    useState(derivedBaseBranch);
  if (derivedBaseBranch !== prevDerivedBaseBranch) {
    setPrevDerivedBaseBranch(derivedBaseBranch);
    setBaseBranch(derivedBaseBranch);
  }
  const [embeddedShowSandbox, setEmbeddedShowSandbox] = useState(false);
  const [isSandboxStarting, setIsSandboxStarting] = useState(false);
  const [isSandboxStopping, setIsSandboxStopping] = useState(false);
  const [isRetryingStartupCommands, setIsRetryingStartupCommands] =
    useState(false);
  const [isRunningDevServer, setIsRunningDevServer] = useState(false);
  const [isRunningBackgroundCommands, setIsRunningBackgroundCommands] =
    useState(false);
  const [showRunDevServerConfirm, setShowRunDevServerConfirm] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [showStartupCommandsConfirm, setShowStartupCommandsConfirm] =
    useState(false);
  const [internalActiveTab, setInternalActiveTab] =
    useState<TaskDetailTab>("activity");
  // Carries its own tone: "the branch has nothing to PR" is an outcome, not a
  // failure, and must not render in destructive red.
  const [executionError, setExecutionError] =
    useState<ConvexErrorPresentation | null>(null);

  const activeTab: TaskDetailTab =
    routing?.mode === "quick-detail"
      ? routing.quick.detailTab
      : routing?.mode === "project-detail"
        ? routing.project.detailTab
        : internalActiveTab;

  const setActiveTab = (tab: TaskDetailTab) => {
    if (routing?.mode === "quick-detail") {
      routing.quick.onDetailTabChange(tab);
    } else if (routing?.mode === "project-detail") {
      routing.project.onDetailTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  const showSandbox =
    routing?.mode === "quick-sandbox"
      ? true
      : routing?.mode === "quick-detail"
        ? false
        : embeddedShowSandbox;

  const handleStartExecution = async () => {
    setIsStarting(true);
    try {
      await startExecution({ id: taskId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start execution";
      setExecutionError({ message, tone: "error" });
    }
    setIsStarting(false);
  };

  const handleResolveConflicts = async () => {
    setIsStarting(true);
    try {
      await startExecution({ id: taskId, mode: "resolve_conflicts" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start execution";
      setExecutionError({ message, tone: "error" });
    }
    setIsStarting(false);
  };

  const handleStopExecution = async () => {
    setIsStopping(true);
    try {
      await cancelExecution({ taskId });
    } catch (err) {
      console.error("Failed to stop execution:", err);
      toast.error("Could not stop the run. Try again.");
    }
    setIsStopping(false);
  };

  const canStartSandbox =
    task?.status !== undefined &&
    PREVIEW_SANDBOX_ALLOWED_STATUSES.includes(task.status);

  const isSandboxActive = task?.reviewTaskSandboxStatus === "active";
  const isSandboxStartingFromStatus =
    task?.reviewTaskSandboxStatus === "starting";
  const isSandboxStoppingFromStatus =
    task?.reviewTaskSandboxStatus === "stopping";
  const hasReviewSandbox = task?.sandboxId !== undefined;
  const canViewSandbox =
    canStartSandbox ||
    hasReviewSandbox ||
    isSandboxActive ||
    isSandboxStartingFromStatus ||
    isSandboxStoppingFromStatus;
  const sandboxStartupStreaming = useQuery(
    api.streaming.get,
    isSandboxStartingFromStatus
      ? { entityId: `task-sandbox-startup-${taskId}` }
      : "skip",
  );

  const openSandboxAfterStart = () => {
    if (routing?.mode === "quick-detail") {
      routing.quick.onOpenSandboxView("preview");
    } else {
      setEmbeddedShowSandbox(true);
    }
  };

  const handleStartSandbox = async () => {
    setIsSandboxStarting(true);
    try {
      await startTaskSandboxMutation({ taskId });
      openSandboxAfterStart();
    } catch (err) {
      console.error("Failed to start sandbox:", err);
      toast.error("Could not start the sandbox. Try again.");
    }
    setIsSandboxStarting(false);
  };

  const handleStopSandbox = async () => {
    setIsSandboxStopping(true);
    try {
      await stopTaskSandboxMutation({ taskId });
    } catch (err) {
      console.error("Failed to stop sandbox:", err);
      toast.error("Could not stop the sandbox. Try again.");
    }
    setIsSandboxStopping(false);
  };

  const handleRetryStartupCommands = async () => {
    setIsRetryingStartupCommands(true);
    try {
      await retryStartupCommandsMutation({ taskId });
      openSandboxAfterStart();
    } catch (err) {
      console.error("Failed to retry startup commands:", err);
      toast.error("Could not rerun the startup commands. Try again.");
    }
    setIsRetryingStartupCommands(false);
  };

  const handleRunDevServer = async () => {
    setIsRunningDevServer(true);
    try {
      await runDevServerMutation({ taskId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to run dev server";
      setExecutionError({ message, tone: "error" });
    }
    setIsRunningDevServer(false);
  };

  const handleRunBackgroundCommands = async () => {
    setIsRunningBackgroundCommands(true);
    try {
      await runBackgroundCommandsMutation({ taskId });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to run background commands";
      setExecutionError({ message, tone: "error" });
    }
    setIsRunningBackgroundCommands(false);
  };

  const devServerCommandLabel = (() => {
    const fromTask = task?.devCommand?.trim();
    if (fromTask) return fromTask;
    const fromRepo = repoForTask?.devCommand?.trim();
    if (fromRepo) return fromRepo;
    return "Auto-detected from package.json (e.g. pnpm run dev)";
  })();

  const handleCreatePr = async () => {
    setIsCreatingPr(true);
    try {
      await createTaskPrAction({ taskId });
    } catch (err) {
      setExecutionError(convexErrorPresentation(err, "Failed to create PR"));
    }
    setIsCreatingPr(false);
  };

  const handleSelectSurface = (surface: SandboxSurface) => {
    if (surface === "sandbox") {
      if (routing?.mode === "quick-sandbox") return;
      if (routing?.mode === "quick-detail") {
        routing.quick.onOpenSandboxView("preview");
        return;
      }
      setEmbeddedShowSandbox(true);
      return;
    }
    if (routing?.mode === "quick-sandbox") {
      routing.quick.onExitSandboxView();
      return;
    }
    if (routing?.mode === "quick-detail") return;
    setEmbeddedShowSandbox(false);
  };

  const status = task?.status;
  const canEditText = canEditTaskText(status, Boolean(hasActiveRun));
  const latestPrUrl = runs?.find((r) => r.prUrl)?.prUrl;
  const latestPrError = runs?.find((r) => r.prError)?.prError;
  const latestDeployment = runs?.find((r) => r.deploymentStatus);
  const canCreatePr = !latestPrUrl && (runs?.length ?? 0) > 0 && !hasActiveRun;
  const modalWidthClass = "max-w-[calc(100vw-2rem)] md:max-w-6xl";
  const layoutGridClass = "grid-cols-1 md:grid-cols-[1fr_1fr_200px]";
  const hasTabContent =
    (runs !== undefined && runs.length > 0) ||
    (comments !== undefined && comments.length > 0);
  const showTabsColumn = status !== "todo" || hasTabContent;
  const creatorUser = task?.createdBy
    ? users?.find((u) => u._id === task.createdBy)
    : undefined;

  return {
    isLoading: taskResult === undefined,
    isNotFound: taskResult === null,

    task,
    status,
    runs,
    comments,
    taskActivity,
    users,
    creatorUser,
    projects,
    streaming,

    isOwner,
    isBlocked,
    hasActiveRun: Boolean(hasActiveRun),
    isProjectTask,
    hasRuns,
    canEditTaskText: canEditText,
    showTabsColumn,
    isActivityBusy: Boolean(hasActiveRun),

    activeRun,
    activeRunElapsed,
    latestPrUrl,
    latestPrError,
    latestDeployment,

    activeTab,
    setActiveTab,
    baseBranch,
    setBaseBranch,
    executionError,
    setExecutionError,
    showStopConfirm,
    setShowStopConfirm,
    showResolveConfirm,
    setShowResolveConfirm,
    showStartupCommandsConfirm,
    setShowStartupCommandsConfirm,
    showRunDevServerConfirm,
    setShowRunDevServerConfirm,
    isStarting,
    isStopping,

    handleStartExecution,
    handleStopExecution,
    handleResolveConflicts,

    canStartSandbox,
    canViewSandbox,
    showSandbox,
    isSandboxActive,
    isSandboxStarting: isSandboxStarting || isSandboxStartingFromStatus,
    sandboxStartupActivity: sandboxStartupStreaming?.currentActivity,
    isSandboxStopping: isSandboxStopping || isSandboxStoppingFromStatus,
    handleStartSandbox,
    handleStopSandbox,
    handleSelectSurface,
    handleRetryStartupCommands,
    isRetryingStartupCommands,
    handleRunDevServer,
    isRunningDevServer,
    handleRunBackgroundCommands,
    isRunningBackgroundCommands,
    devServerCommandLabel,
    sandboxId: task?.sandboxId,
    reviewTaskSandboxStatus: task?.reviewTaskSandboxStatus,

    canCreatePr,
    isCreatingPr,
    handleCreatePr,

    layoutGridClass,
    modalWidthClass,
  };
}
