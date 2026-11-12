"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryState } from "nuqs";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
  api,
  taskScheduledAt,
  type Id,
  type SandboxOwner,
} from "@eva/backend";
import { cn } from "@eva/ui";
import {
  Badge,
  Spinner,
  tokenTransition,
  useRequestConfirm,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { MobilePaneSwitcher } from "@/lib/components/MobilePaneSwitcher";
import { IconClock } from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { useTaskDetail } from "./useTaskDetail";
import { TaskHeader } from "./_components/TaskHeader";
import { TaskDescription } from "./_components/TaskDescription";
import { TaskAttachments } from "./_components/TaskAttachments";
import { ActivityTimeline } from "./_components/ActivityTimeline";
import { TaskSubscribers } from "./_components/TaskSubscribers";
import { TaskReactionsProvider } from "./_components/TaskReactionsProvider";
import { StatusFieldsSection } from "./_components/StatusFieldsSection";
import { TaskFooter } from "./_components/TaskFooter";
import {
  ResolveConfirmDialog,
  RunDevServerConfirmDialog,
} from "@/lib/components/tasks/_components/TaskConfirmDialogs";
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
import { SandboxSurfaceTabs } from "@/lib/components/sandbox/SandboxSurfaceTabs";
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
import { useSimpleView } from "@/lib/hooks/useSimpleView";
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
  /** Which detail pane is on screen below `md`; both show at `md` and up. */
  const [showMobileProperties, setShowMobileProperties] = useState(false);
  const [fileViewerPath, setFileViewerPath] = useQueryState(
    "file",
    fileViewerPathParser,
  );
  const { diffFile } = useDiffSearchParams();
  const quickTaskHeaderActionsSlot = useQuickTaskHeaderActionsSlot();
  const simpleView = useSimpleView();
  // Embedded (non quick-sandbox) tab: the URL's `?file=` / `?diffFile=` own
  // it, so a reload lands back on Files / Review. A tab the user picks
  // afterwards overrides that for this mount.
  const [pickedSandboxTab, setEmbeddedSandboxTab] =
    useState<SandboxTab | null>(null);
  const urlSandboxTab: SandboxTab = simpleView
    ? "preview"
    : fileViewerPath
      ? "files"
      : diffFile
        ? "review"
        : "preview";
  const embeddedSandboxTab = pickedSandboxTab ?? urlSandboxTab;
  const sandboxRailWidthPx = useSandboxRailWidthPx();
  const prewarmSessionChatDaemon = useMutation(
    api.sessionWorkflow.prewarmDaemon,
  );

  const {
    isLoading,
    isNotFound,
    task,
    status,
    comments,
    taskActivity,
    users,
    creatorUser,
    projects,
    isOwner,
    isBlocked,
    hasActiveRun,
    isProjectTask,
    hasRuns,
    canEditTaskText,
    latestPrUrl,
    latestPrError,
    latestDeployment,
    baseBranch,
    executionError,
    showResolveConfirm,
    setShowResolveConfirm,
    showRunDevServerConfirm,
    setShowRunDevServerConfirm,
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
    handleRunDevServer,
    isRunningDevServer,
    handleRunBackgroundCommands,
    isRunningBackgroundCommands,
    devServerCommandLabel,
    sandboxId,
    canCreatePr,
    isCreatingPr,
    handleCreatePr,
    taskSession,
  } = useTaskDetail(taskId, routing);
  const { sandbox } = taskSession;
  // A task chats in a session chat (a project task's own chat in the
  // project's session); before that chat exists, the task id reads empty.
  const chatId = taskSession.owned?.chatId;
  const chatParentId = chatId;
  const isAgentActive = useTaskAgentActive(chatParentId, task);
  const scheduledAt = task ? taskScheduledAt(task) : undefined;
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
    if (simpleView) return;
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
  const isSandboxViewActive = showSandbox;

  const routeSandboxTab: TaskRouteSandboxTab =
    routing?.mode === "quick-sandbox" ? routing.quick.sandboxTab : "preview";
  const activeSandboxTab: SandboxTab =
    routing?.mode === "quick-sandbox" ? routeSandboxTab : embeddedSandboxTab;

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
      <SandboxEmptyRailFrame collapsed={collapsed} onToggle={onToggle}>
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
      storageKey="task-sandbox-panel"
      leftDefaultSize="40%"
      leftMinWidthPx={350}
      rightMinWidthPx={300}
      rightCollapsedSizePx={sandboxRailWidthPx}
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
            collapsed={rightPanelCollapsed}
            onToggle={onToggleRightPanel}
            ownerLabel="task"
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

  const detailContent = (
    <TaskReactionsProvider taskId={taskId}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Below `md` the two columns stack, which buried Status / Priority /
            Labels / Project under the whole (unbounded) activity timeline — on a
            phone the only way to change a task's status was to scroll past every
            run and comment. One pane at a time instead, same model the split
            primitives use, following ProjectTabs' CSS-gated shape so desktop
            keeps rendering both columns with no JS involved.
            Local state, not a URL tab: on desktop both panes are on screen at
            once, so there is nothing here worth linking to. */}
        <div className="shrink-0 md:hidden">
          <MobilePaneSwitcher
            labels={{ left: "Overview", right: "Properties" }}
            showingRight={showMobileProperties}
            onSelect={(pane) => setShowMobileProperties(pane === "right")}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar md:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[14fr_6fr] md:grid-rows-1 md:overflow-hidden">
            {/* Only one column is hidden at a time below `md`, and the scroller
                above stays the single scroll owner for whichever is showing. */}
            <div
              className={cn(
                "min-h-0 min-w-0 md:flex md:flex-1 md:flex-col md:overflow-hidden",
                showMobileProperties && "max-md:hidden",
              )}
            >
              <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden md:flex-1 md:overflow-y-auto md:scrollbar">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="shrink-0 space-y-4 px-4 pt-4 md:px-6 md:pr-6 md:pt-5">
                    <div>
                      <TaskHeader
                        taskNumber={task?.taskNumber}
                        title={task?.title}
                        canEditTaskText={canEditTaskText}
                        hasActiveRun={hasActiveRun}
                        taskId={taskId}
                      />
                      {scheduledAt ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs font-normal text-muted-foreground"
                          >
                            <IconClock size={11} />
                            {status === "todo"
                              ? "Scheduled for"
                              : "Was scheduled for"}{" "}
                            {dayjs(scheduledAt).format("DD/MM/YYYY HH:mm")}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                    <TaskDescription
                      description={task?.description}
                      canEditTaskText={canEditTaskText}
                      hasActiveRun={hasActiveRun}
                      taskId={taskId}
                      inline={true}
                    />

                    <TaskAttachments taskId={taskId} />

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                      <div className="text-sm font-medium text-foreground">
                        Activity
                      </div>
                      <TaskSubscribers taskId={taskId} users={users} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col sm:mt-4">
                    <ActivityTimeline
                      taskId={taskId}
                      createdAt={task.createdAt}
                      creatorUser={creatorUser}
                      comments={comments}
                      taskActivity={taskActivity}
                      users={users}
                      isProjectTask={isProjectTask}
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* `mt-6` is gone: it separated this from the overview when the two
                stacked, and as its own pane it starts at the top instead. */}
            <div
              className={cn(
                "flex min-w-0 shrink-0 flex-col overflow-x-hidden px-4 pb-4 max-md:pt-4 md:overflow-hidden md:px-0 md:pb-0 md:pl-8 md:pr-6 md:pt-5",
                !showMobileProperties && "max-md:hidden",
              )}
            >
              <StatusFieldsSection
                taskId={taskId}
                task={task}
                status={status}
                isBlocked={isBlocked}
                users={users}
                projects={projects}
                baseBranch={baseBranch}
                latestDeployment={latestDeployment}
                hasRuns={hasRuns}
                isOwner={isOwner}
                allTags={allTags}
              />
            </div>
          </div>
        </div>
      </div>
    </TaskReactionsProvider>
  );

  const actionsSlotElement = quickTaskHeaderActionsSlot?.actionsElement;
  const titleSlotElement = quickTaskHeaderActionsSlot?.titleAfterElement;

  const quickTaskHeaderActions =
    isQuickTask && actionsSlotElement ? (
      <TaskFooter
        variant="header"
        taskId={taskId}
        task={task}
        isAgentActive={isAgentActive}
        status={status}
        hasActiveRun={hasActiveRun}
        hasRuns={hasRuns}
        latestPrUrl={latestPrUrl}
        latestPrError={latestPrError}
        latestDeployment={latestDeployment}
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
        onRunDevServer={() =>
          requestConfirm(
            () => setShowRunDevServerConfirm(true),
            handleRunDevServer,
          )
        }
        isRunningDevServer={isRunningDevServer}
        onRunBackgroundCommands={handleRunBackgroundCommands}
        isRunningBackgroundCommands={isRunningBackgroundCommands}
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
        <AnimatePresence mode="wait" initial={false}>
          {isSandboxViewActive ? (
            <m.div
              key="sandbox"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={tokenTransition.fast}
            >
              {sandboxContent}
            </m.div>
          ) : (
            <m.div
              key="task"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={tokenTransition.fast}
            >
              {detailContent}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <ResolveConfirmDialog
        open={showResolveConfirm}
        onOpenChange={setShowResolveConfirm}
        onConfirm={handleResolveConflicts}
        isLoading={isStarting}
      />
      <RunDevServerConfirmDialog
        open={showRunDevServerConfirm}
        onOpenChange={setShowRunDevServerConfirm}
        onConfirm={handleRunDevServer}
        isLoading={isRunningDevServer}
        devCommandLabel={devServerCommandLabel}
      />
    </>
  );
}
