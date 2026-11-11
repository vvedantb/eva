"use client";

import { toast, convexErrorMessage } from "@vvedantb/ui";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { sandboxStartupEntityId } from "@eva/shared";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { SandboxSurface } from "@/lib/components/sandbox/SandboxSurfaceTabs";
import type { TaskDetailTab } from "./_components/task-detail-constants";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import { useSandboxLifecycle } from "@/lib/components/sandbox/useSandboxLifecycle";
import type { TaskSandboxFields, TaskSession } from "./useTaskSession";

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

const PREVIEW_SANDBOX_ALLOWED_STATUSES = [
  "code_review",
  "business_review",
  "done",
];

type TaskDetailTask = FunctionReturnType<typeof api.agentTasks.get> | undefined;

/** Detail tab: URL-owned when routed, local state otherwise. */
export function useTaskDetailTab(routing: UseTaskDetailRouting | undefined) {
  const [internalActiveTab, setInternalActiveTab] =
    useState<TaskDetailTab>("activity");

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

  return { activeTab, setActiveTab };
}

/** Agent run start / stop / resolve-conflicts and PR creation. */
export function useTaskExecutionControls(taskId: Id<"agentTasks">) {
  const startExecution = useMutation(api.agentTasks.startExecution);
  const cancelExecution = useMutation(api.taskWorkflow.cancelExecution);
  const createTaskPrAction = useAction(api.taskWorkflowActions.createTaskPr);

  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const handleStartExecution = async () => {
    setIsStarting(true);
    try {
      await startExecution({ id: taskId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start execution";
      setExecutionError(message);
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
      setExecutionError(message);
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

  const handleCreatePr = async () => {
    setIsCreatingPr(true);
    try {
      await createTaskPrAction({ taskId });
    } catch (err) {
      setExecutionError(convexErrorMessage(err, "Failed to create PR"));
    }
    setIsCreatingPr(false);
  };

  return {
    executionError,
    setExecutionError,
    showStopConfirm,
    setShowStopConfirm,
    showResolveConfirm,
    setShowResolveConfirm,
    isStarting,
    isStopping,
    isCreatingPr,
    handleStartExecution,
    handleStopExecution,
    handleResolveConflicts,
    handleCreatePr,
  };
}

/**
 * A task moved back to `todo` after it already ran keeps its branch, so it
 * previews like a reviewed task rather than offering a first run again.
 * Mirrors `isPreviewSandboxAllowed` in the backend.
 */
function deriveSandboxFlags(
  task: TaskDetailTask,
  sandbox: TaskSandboxFields,
  hasRuns: boolean,
) {
  const canStartSandbox =
    task?.status !== undefined &&
    (PREVIEW_SANDBOX_ALLOWED_STATUSES.includes(task.status) ||
      (task.status === "todo" && hasRuns));

  const isSandboxActive = sandbox.status === "active";
  const isSandboxStartingFromStatus = sandbox.status === "starting";
  const isSandboxStoppingFromStatus = sandbox.status === "stopping";
  const hasReviewSandbox = sandbox.sandboxId !== undefined;
  const canViewSandbox =
    canStartSandbox ||
    hasReviewSandbox ||
    isSandboxActive ||
    isSandboxStartingFromStatus ||
    isSandboxStoppingFromStatus;

  return {
    canStartSandbox,
    isSandboxActive,
    isSandboxStartingFromStatus,
    isSandboxStoppingFromStatus,
    canViewSandbox,
  };
}

function resolveShowSandbox(
  routing: UseTaskDetailRouting | undefined,
  embeddedShowSandbox: boolean,
) {
  return routing?.mode === "quick-sandbox"
    ? true
    : routing?.mode === "quick-detail"
      ? false
      : embeddedShowSandbox;
}

function createSurfaceSelector(
  routing: UseTaskDetailRouting | undefined,
  setEmbeddedShowSandbox: (show: boolean) => void,
) {
  return (surface: SandboxSurface) => {
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
}

/**
 * Review sandbox lifecycle, startup / dev-server commands and surface toggle.
 * A quick task's sandbox is its owned session's (`useTaskSession`).
 */
export function useTaskSandboxControls({
  taskId,
  task,
  taskSession,
  hasRuns,
  routing,
  setExecutionError,
}: {
  taskId: Id<"agentTasks">;
  task: TaskDetailTask;
  taskSession: TaskSession;
  hasRuns: boolean;
  routing: UseTaskDetailRouting | undefined;
  setExecutionError: (message: string | null) => void;
}) {
  const startTaskSandboxMutation = useMutation(api.agentTasks.startTaskSandbox);
  const stopTaskSandboxMutation = useMutation(api.agentTasks.stopTaskSandbox);
  const startSessionSandbox = useMutation(api.sessions.startSandbox);
  const stopSessionSandbox = useMutation(api.sessions.stopSandbox);
  const { sandbox } = taskSession;
  const startSandbox = async () => {
    if (!taskSession.isQuickTask) return await startTaskSandboxMutation({ taskId });
    const { sessionId } = await taskSession.ensure();
    return await startSessionSandbox({ sessionId });
  };
  const stopSandbox = async () => {
    if (!taskSession.isQuickTask) return await stopTaskSandboxMutation({ taskId });
    const { sessionId } = await taskSession.ensure();
    return await stopSessionSandbox({ sessionId });
  };
  const runTaskDevServer = useMutation(api.agentTasks.runDevServer);
  const runTaskBackgroundCommands = useMutation(
    api.agentTasks.runBackgroundCommands,
  );
  const runSessionDevServer = useMutation(api.sessions.runDevServer);
  const runSessionBackgroundCommands = useMutation(
    api.sessions.runBackgroundCommands,
  );
  // A quick task's sandbox is its session's; a running one implies the
  // session exists, so `ensure` only reads it.
  const runDevServerMutation = async () => {
    if (!taskSession.isQuickTask) return await runTaskDevServer({ taskId });
    const { sessionId } = await taskSession.ensure();
    return await runSessionDevServer({ sessionId });
  };
  const runBackgroundCommandsMutation = async () => {
    if (!taskSession.isQuickTask) {
      return await runTaskBackgroundCommands({ taskId });
    }
    const { sessionId } = await taskSession.ensure();
    return await runSessionBackgroundCommands({ sessionId });
  };

  const [embeddedShowSandbox, setEmbeddedShowSandbox] = useState(false);
  const lifecycle = useSandboxLifecycle(sandbox.status);
  const [isRunningDevServer, setIsRunningDevServer] = useState(false);
  const [isRunningBackgroundCommands, setIsRunningBackgroundCommands] =
    useState(false);
  const [showRunDevServerConfirm, setShowRunDevServerConfirm] = useState(false);

  const flags = deriveSandboxFlags(task, sandbox, hasRuns);
  const sandboxStartupStreaming = useQuery(
    api.streaming.get,
    flags.isSandboxStartingFromStatus
      ? { entityId: sandboxStartupEntityId(sandbox.owner) }
      : "skip",
  );

  const openSandboxAfterStart = () => {
    if (routing?.mode === "quick-detail") {
      routing.quick.onOpenSandboxView("preview");
    } else {
      setEmbeddedShowSandbox(true);
    }
  };

  const handleStartSandbox = () =>
    lifecycle.run("start", async () => {
      try {
        await startSandbox();
        openSandboxAfterStart();
      } catch (err) {
        console.error("Failed to start sandbox:", err);
        toast.error("Could not start the sandbox. Try again.");
      }
    });

  const handleStopSandbox = () =>
    lifecycle.run("stop", async () => {
      try {
        await stopSandbox();
      } catch (err) {
        console.error("Failed to stop sandbox:", err);
        toast.error("Could not stop the sandbox. Try again.");
      }
    });

  const handleRunDevServer = async () => {
    setIsRunningDevServer(true);
    try {
      await runDevServerMutation();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to run dev server";
      setExecutionError(message);
    }
    setIsRunningDevServer(false);
  };

  const handleRunBackgroundCommands = async () => {
    setIsRunningBackgroundCommands(true);
    try {
      await runBackgroundCommandsMutation();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to run background commands";
      setExecutionError(message);
    }
    setIsRunningBackgroundCommands(false);
  };

  return {
    showRunDevServerConfirm,
    setShowRunDevServerConfirm,

    canStartSandbox: flags.canStartSandbox,
    canViewSandbox: flags.canViewSandbox,
    showSandbox: resolveShowSandbox(routing, embeddedShowSandbox),
    isSandboxActive: flags.isSandboxActive,
    isSandboxStarting: lifecycle.isStarting,
    sandboxStartupActivity: sandboxStartupStreaming?.currentActivity,
    isSandboxStopping: lifecycle.isStopping,
    handleStartSandbox,
    handleStopSandbox,
    handleSelectSurface: createSurfaceSelector(routing, setEmbeddedShowSandbox),
    handleRunDevServer,
    isRunningDevServer,
    handleRunBackgroundCommands,
    isRunningBackgroundCommands,
  };
}
