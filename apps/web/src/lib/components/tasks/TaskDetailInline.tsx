"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryState } from "nuqs";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api, type Id, type SandboxOwner } from "@eva/backend";
import { Spinner, TabsTransition, useRequestConfirm } from "@vvedantb/ui";
import { useTaskDetail } from "./useTaskDetail";
import { TaskDetailsPane } from "./TaskDetailsPane";
import { ProjectTaskPageRedirect } from "./ProjectTaskPageRedirect";
import { TaskFooter } from "./_components/TaskFooter";
import { ResolveConfirmDialog } from "@/lib/components/tasks/_components/TaskConfirmDialogs";
import { TaskSandboxPanel } from "./TaskSandboxPanel";
import { TaskSandboxChatPanel } from "./TaskSandboxChatPanel";
import { useTaskAgentActive } from "./taskAgentActivity";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import {
  SandboxWorkspace,
  type TerminalPanelApi,
} from "@/lib/components/sandbox/SandboxWorkspace";
import { useSandboxRailWidthPx } from "@/lib/components/sandbox/useSandboxRailLabels";
import { useAgentBrowsingAutoSwitch } from "@/lib/components/sandbox/useSandboxLifecycle";
import {
  SandboxEmptyRailFrame,
  SandboxNotStartedRail,
} from "@/lib/components/sandbox/SandboxPanelFrame";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import type { SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import {
  SANDBOX_SURFACES,
  SandboxSurfaceTabs,
} from "@/lib/components/sandbox/SandboxSurfaceTabs";
import { useChatUnread } from "@/lib/components/sandbox/useChatUnread";
import { useDiffSearchParams } from "@/lib/components/sandbox/useDiffSearchParams";
import {
  fileViewerPathParser,
  isTaskRouteSandboxTab,
  type SandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";
import type { UseTaskDetailRouting } from "./useTaskDetailControls";
import { useQuickTaskHeaderActionsSlot } from "@/lib/components/quick-tasks/QuickTaskHeaderActionsSlot";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import {
  useIsHiddenSandboxTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";
import { useRepo } from "@/lib/contexts/RepoContext";

interface TaskDetailInlineProps {
  onClose: () => void;
  taskId: Id<"agentTasks">;
  allTags?: string[];
  routing?: UseTaskDetailRouting;
}

export function TaskDetailInline({
  taskId,
  allTags = [],
  routing,
}: TaskDetailInlineProps) {
  const navigate = useNavigate();
  const { basePath } = useRepo();
  const [fileViewerPath, setFileViewerPath] = useQueryState(
    "file",
    fileViewerPathParser,
  );
  const { diffFile } = useDiffSearchParams();
  const quickTaskHeaderActionsSlot = useQuickTaskHeaderActionsSlot();
  const simpleView = useSimpleView();
  const isHiddenTab = useIsHiddenSandboxTab();
  // Embedded (non quick-sandbox) tab: the URL's `?file=` / `?diffFile=` own
  // it, so a reload lands back on Files / Review. A tab the user picks
  // afterwards overrides that for this mount.
  const [pickedSandboxTab, setEmbeddedSandboxTab] =
    useState<SandboxTab | null>(null);
  const sandboxRailWidthPx = useSandboxRailWidthPx();
  const prewarmSessionChatDaemon = useMutation(
    api.sessionWorkflow.prewarmDaemon,
  );

  const detail = useTaskDetail(taskId, routing);
  const {
    isLoading,
    isNotFound,
    task,
    status,
    hasActiveRun,
    isArchived,
    hasRuns,
    latestPrUrl,
    latestPrError,
    deploymentStatus,
    executionError,
    showResolveConfirm,
    setShowResolveConfirm,
    isStarting,
    handleStartExecution,
    handleResolveConflicts,
    // Sandbox preview
    canStartSandbox,
    canViewSandbox,
    showSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    handleStartSandbox,
    handleStopSandbox,
    handleSelectSurface,
    sandboxId,
    canCreatePr,
    isCreatingPr,
    handleCreatePr,
    taskSession,
  } = detail;
  const { sandbox } = taskSession;
  // A project task with a PR opens on Review, as in the project panel
  // (`defaultProjectTaskTab`).
  const urlSandboxTab: SandboxTab = simpleView
    ? "preview"
    : fileViewerPath && !isHiddenTab("files")
      ? "files"
      : diffFile ||
          (routing?.mode === "project-task" && latestPrUrl !== undefined)
        ? "review"
        : "preview";
  const embeddedSandboxTab = pickedSandboxTab ?? urlSandboxTab;
  // A task chats in a session chat (a project task's own chat in the
  // project's session); before that chat exists, the task id reads empty.
  const chatId = taskSession.owned?.chatId;
  const chatParentId = chatId;
  const isAgentActive = useTaskAgentActive(chatParentId, task);
  const chatUnread = useChatUnread(chatParentId);
  const { request: requestConfirm } = useRequestConfirm();

  useEffect(() => {
    if (!isSandboxActive || !sandboxId || !chatId) return;
    void prewarmSessionChatDaemon({ chatId });
  }, [chatId, isSandboxActive, sandboxId, prewarmSessionChatDaemon]);

  const [expandRightSignal, setExpandRightSignal] = useState(0);

  // Chat file chips → Files tab + `?file=` (same pattern as sessions).
  // Must stay above early returns so hooks order is stable.
  const openFile = (path: string) => {
    if (isHiddenTab("files")) return;
    if (routing?.mode === "quick-sandbox") {
      routing.quick.onOpenFile(path);
      return;
    }
    void setFileViewerPath(path);
    setEmbeddedSandboxTab("files");
  };

  const openDiffs = (repoRelativePath?: string) => {
    if (simpleView) return;
    if (routing?.mode === "quick-sandbox") {
      routing.quick.onViewDiff(repoRelativePath);
      setExpandRightSignal((n) => n + 1);
      return;
    }
    if (repoRelativePath) {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, diffFile: repoRelativePath }),
      });
    }
    setEmbeddedSandboxTab("review");
    setExpandRightSignal((n) => n + 1);
  };

  // Must stay above early returns — same hooks-order constraint as openFile.
  const handleSandboxTabChange = (tab: SandboxTab) => {
    if (routing?.mode === "quick-sandbox") {
      if (tab === "prd" || !isTaskRouteSandboxTab(tab)) {
        routing.quick.onSandboxTabChange("preview");
        return;
      }
      routing.quick.onSandboxTabChange(tab);
      return;
    }
    setEmbeddedSandboxTab(tab);
  };
  // Declared here, not inline in the chat panel JSX, so it keeps its identity
  // and does not re-render every transcript row (same as SessionDetailClient).
  const openAgentsTab = () => {
    handleSandboxTabChange("agents");
    setExpandRightSignal((n) => n + 1);
  };

  useAgentBrowsingAutoSwitch(sandbox.agentBrowsingAt, () => {
    handleSandboxTabChange("browser");
    setExpandRightSignal((n) => n + 1);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner variant="circle" size="sm" className="size-5" />
      </div>
    );
  }

  if (isNotFound || !task) {
    return <EntityNotFound entityLabel="task" />;
  }

  const isQuickTask = task.projectId === undefined;
  // A project task is its chat in its project: the quick task page sends it
  // to its project task page.
  if (!isQuickTask && routing?.mode !== "project-task") {
    return <ProjectTaskPageRedirect task={task} />;
  }
  const isSandboxViewActive = showSandbox;

  const routeSandboxTab: TaskRouteSandboxTab =
    routing?.mode === "quick-sandbox" ? routing.quick.sandboxTab : "preview";
  const activeSandboxTab: SandboxTab =
    routing?.mode === "quick-sandbox" ? routeSandboxTab : embeddedSandboxTab;

  const detailsPane = (
    <TaskDetailsPane
      taskId={taskId}
      task={task}
      detail={detail}
      allTags={allTags}
    />
  );
  // A project task's page has no rail toggle: its panel stays open.
  const isProjectTaskPage = routing?.mode === "project-task";

  // Always mount the sandbox panel when the task can have a sandbox so tabs
  // (Diffs, etc.) stay reachable while stopped — same as sessions. Panes
  // self-gate with their own inactive empty states. Tasks that never ran
  // still get the honest empty message.
  const sandboxRightPanel = (
    panes: SandboxPanesApi,
    owner: SandboxOwner,
    terminalPanel: TerminalPanelApi,
    collapsed: boolean,
    onToggle: () => void,
  ) =>
    task?.repoId && canViewSandbox ? (
      <TaskSandboxPanel
        taskId={taskId}
        sandboxId={sandboxId}
        isActive={isSandboxActive}
        repoId={task.repoId}
        devPort={sandbox.devPort}
        devCommand={sandbox.devCommand}
        owner={owner}
        panes={panes}
        terminalPanel={terminalPanel}
        prUrl={latestPrUrl}
        activeTab={activeSandboxTab}
        onTabChange={handleSandboxTabChange}
        onStartSandbox={
          canStartSandbox && !isSandboxStopping ? handleStartSandbox : undefined
        }
        isSandboxStarting={isSandboxStarting}
        autoWakeEligible={
          sandbox.status === "closed" &&
          sandboxId !== undefined &&
          canStartSandbox &&
          !hasActiveRun
        }
        collapsed={collapsed}
        onToggle={onToggle}
        miniPlayer={
          isQuickTask && task.numId !== undefined
            ? {
                returnTo: `${basePath}/quick-tasks/${task.numId}/sandbox/preview`,
                title: task.title,
              }
            : undefined
        }
      />
    ) : (
      <SandboxEmptyRailFrame
        collapsed={isProjectTaskPage ? false : collapsed}
        onToggle={onToggle}
        showToggle={!isProjectTaskPage}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            No sandbox for this task yet — it becomes available once the task
            has run
          </p>
        </div>
      </SandboxEmptyRailFrame>
    );

  const layout = (
    rightPanel: (ctx: {
      rightPanelCollapsed: boolean;
      onToggleRightPanel: () => void;
    }) => ReactNode,
  ) => (
    <ResizablePanelLayout
      // Remount per task: the open flag is read once at mount.
      key={taskId}
      storageKey="task-sandbox-panel"
      collapsedStorageKey={`task-sandbox-panel:${taskId}`}
      leftDefaultSize="40%"
      leftMinWidthPx={350}
      rightMinWidthPx={300}
      rightCollapsedSizePx={sandboxRailWidthPx}
      seamlessSeparator
      defaultRightCollapsed={false}
      expandRightSignal={expandRightSignal}
      mobilePaneLabels={{ left: "Chat", right: "Sandbox" }}
      leftPanel={() => (
        <TaskSandboxChatPanel
          taskId={taskId}
          isSandboxActive={isSandboxActive}
          isSandboxToggling={isSandboxStarting || isSandboxStopping}
          sandboxStartupActivity={sandboxStartupActivity}
          onOpenFile={openFile}
          onViewDiff={openDiffs}
          onOpenAgentsTab={openAgentsTab}
          isArchived={isArchived}
          onSandboxToggle={
            canStartSandbox || isSandboxActive
              ? (action) => {
                  if (action === "start") void handleStartSandbox();
                  else void handleStopSandbox();
                }
              : undefined
          }
        />
      )}
      rightPanel={rightPanel}
    />
  );

  const sandboxContent = (
    <SandboxSurfaceProviders
      onOpenFile={openFile}
      onOpenDiffsTab={() => openDiffs()}
    >
      {sandbox.owner ? (
        <SandboxWorkspace
          owner={sandbox.owner}
          storageScope={`task:${taskId}`}
          sandboxId={sandboxId}
          isActive={isSandboxActive}
          terminalPanes={sandbox.terminalPanes}
        >
          {(panes, owner, terminalPanel) =>
            layout(({ rightPanelCollapsed, onToggleRightPanel }) =>
              sandboxRightPanel(
                panes,
                owner,
                terminalPanel,
                rightPanelCollapsed,
                onToggleRightPanel,
              ),
            )
          }
        </SandboxWorkspace>
      ) : (
        layout(({ rightPanelCollapsed, onToggleRightPanel }) => (
          <SandboxNotStartedRail
            collapsed={isProjectTaskPage ? false : rightPanelCollapsed}
            onToggle={onToggleRightPanel}
            ownerLabel="task"
            showToggle={!isProjectTaskPage}
            isPending={sandbox.sessionPending}
            onStart={
              canStartSandbox && !isSandboxStopping
                ? () => void handleStartSandbox()
                : undefined
            }
            isStarting={isSandboxStarting}
          />
        ))
      )}
    </SandboxSurfaceProviders>
  );

  const actionsSlotElement = quickTaskHeaderActionsSlot?.actionsElement;
  const titleSlotElement = quickTaskHeaderActionsSlot?.titleAfterElement;

  const quickTaskHeaderActions =
    isQuickTask && actionsSlotElement ? (
      <TaskFooter
        variant="header"
        taskId={taskId}
        task={task}
        chatId={chatId}
        isAgentActive={isAgentActive}
        status={status}
        hasActiveRun={hasActiveRun}
        hasRuns={hasRuns}
        latestPrUrl={latestPrUrl}
        latestPrError={latestPrError}
        deploymentStatus={deploymentStatus}
        executionError={executionError}
        isStarting={isStarting}
        canStartSandbox={canStartSandbox}
        isSandboxActive={isSandboxActive}
        isSandboxStarting={isSandboxStarting}
        isSandboxStopping={isSandboxStopping}
        sandbox={sandbox}
        canCreatePr={canCreatePr}
        isCreatingPr={isCreatingPr}
        onCreatePr={handleCreatePr}
        onStartSandbox={handleStartSandbox}
        onStopSandbox={handleStopSandbox}
        onStartExecution={handleStartExecution}
        onResolveConfirm={() =>
          requestConfirm(
            () => setShowResolveConfirm(true),
            handleResolveConflicts,
          )
        }
      />
    ) : null;

  // Navigation, so it goes next to the breadcrumb rather than into the header's
  // action cluster — same split as the project header.
  const quickTaskSurfaceTabs =
    isQuickTask && canViewSandbox && titleSlotElement ? (
      <SandboxSurfaceTabs
        mainLabel="Task"
        surface={isSandboxViewActive ? "sandbox" : "main"}
        isSandboxActive={isSandboxActive}
        isSandboxStarting={isSandboxStarting}
        isSandboxStopping={isSandboxStopping}
        isAgentActive={isAgentActive}
        hasUnread={chatUnread}
        onSurfaceChange={handleSelectSurface}
      />
    ) : null;

  return (
    <>
      {quickTaskHeaderActions && actionsSlotElement
        ? createPortal(quickTaskHeaderActions, actionsSlotElement)
        : null}
      {quickTaskSurfaceTabs && titleSlotElement
        ? createPortal(quickTaskSurfaceTabs, titleSlotElement)
        : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsTransition
          value={isSandboxViewActive ? "sandbox" : "main"}
          order={SANDBOX_SURFACES}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          panelClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {isSandboxViewActive ? sandboxContent : detailsPane}
        </TabsTransition>
      </div>
      <ResolveConfirmDialog
        open={showResolveConfirm}
        onOpenChange={setShowResolveConfirm}
        onConfirm={handleResolveConflicts}
        isLoading={isStarting}
      />
    </>
  );
}
