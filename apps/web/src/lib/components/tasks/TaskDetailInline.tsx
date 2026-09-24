"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryState } from "nuqs";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api, type Id, type SandboxOwner } from "@eva/backend";
import { Badge, CircleSpinner, cn, motionFast } from "@eva/ui";
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
import { StopConfirmDialog } from "./_components/StopConfirmDialog";
import { ResolveConfirmDialog } from "./_components/ResolveConfirmDialog";
import { StartupCommandsConfirmDialog } from "./_components/StartupCommandsConfirmDialog";
import { RunDevServerConfirmDialog } from "./_components/RunDevServerConfirmDialog";
import { requestConfirm, useAltHeld } from "@/lib/confirm";
import { TaskSandboxPanel } from "./TaskSandboxPanel";
import { TaskSandboxChatPanel } from "./TaskSandboxChatPanel";
import { findFirstRunChatTurnRun, isRunInProgress } from "./firstRunChatTurn";
import { isTaskAgentActive } from "./taskAgentActivity";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import {
  SandboxWorkspace,
  type TerminalPanelApi,
} from "@/lib/components/sandbox/SandboxWorkspace";
import { useSandboxRailWidthPx } from "@/lib/components/sandbox/useSandboxRailLabels";
import { SandboxEmptyRailFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import type { SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import { SandboxSurfaceTabs } from "@/lib/components/sandbox/SandboxSurfaceTabs";
import {
  fileViewerPathParser,
  isTaskRouteSandboxTab,
  type SandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";
import type { UseTaskDetailRouting } from "./useTaskDetail";
import { useQuickTaskHeaderActionsSlot } from "@/lib/components/quick-tasks/QuickTaskHeaderActionsSlot";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

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
  const [embeddedSandboxTab, setEmbeddedSandboxTab] =
    useState<SandboxTab>("preview");
  /** Which detail pane is on screen below `md`; both show at `md` and up. */
  const [showMobileProperties, setShowMobileProperties] = useState(false);
  const [, setFileViewerPath] = useQueryState("file", fileViewerPathParser);
  const quickTaskHeaderActionsSlot = useQuickTaskHeaderActionsSlot();
  const simpleView = useSimpleView();
  const sandboxRailWidthPx = useSandboxRailWidthPx();
  const prewarmChatDaemon = useMutation(
    api.agentTaskChatWorkflow.prewarmChatDaemon,
  );

  const {
    isLoading,
    isNotFound,
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
    hasActiveRun,
    isProjectTask,
    hasRuns,
    canEditTaskText,
    isActivityBusy,
    activeRunElapsed,
    latestPrUrl,
    latestPrError,
    latestDeployment,
    baseBranch,
    executionError,
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
    // Sandbox preview
    canStartSandbox,
    canViewSandbox,
    showSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
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
    sandboxId,
    canCreatePr,
    isCreatingPr,
    handleCreatePr,
  } = useTaskDetail(taskId, routing);
  const altHeld = useAltHeld();

  useEffect(() => {
    if (!isSandboxActive || !sandboxId) return;
    void prewarmChatDaemon({ taskId });
  }, [taskId, isSandboxActive, sandboxId, prewarmChatDaemon]);

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

  // Auto-switch to Browser + expand sandbox panel on lock transition only
  // (undefined → set). Mirrors SessionDetailClient's pattern. Don't fight the
  // user if they switch away mid-lock.
  const prevAgentBrowsingAt = useRef<number | undefined>(undefined);
  const agentBrowsingAt = task?.agentBrowsingAt;
  /* eslint-disable no-effect/no-adjust-state-on-prop-change, no-effect/no-pass-data-to-parent --
     The agent taking the browser happens in the sandbox and arrives as a live
     query change, so there is no local event to switch the tab from. */
  useEffect(() => {
    const prev = prevAgentBrowsingAt.current;
    prevAgentBrowsingAt.current = agentBrowsingAt;
    if (agentBrowsingAt === undefined || prev !== undefined) return;
    handleSandboxTabChange("browser");
    setExpandRightSignal((n) => n + 1);
    // Full deps are safe: the ref guard above makes re-runs no-ops, and a
    // disable comment here makes React Compiler skip the whole file.
  }, [agentBrowsingAt, handleSandboxTabChange]);
  /* eslint-enable no-effect/no-adjust-state-on-prop-change, no-effect/no-pass-data-to-parent */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <CircleSpinner size="sm" className="size-5" />
      </div>
    );
  }

  if (isNotFound || !task) {
    return <EntityNotFound entityLabel="task" />;
  }

  const isQuickTask = task.projectId === undefined;
  const isSandboxViewActive = showSandbox;

  // A quick task's first run renders as the opening chat turn in the sandbox
  // view (see firstRunChatTurn.ts). Once it settles there its timeline
  // accordion goes away entirely; while it is still running the row stays —
  // it is the only place with a Stop button and it may yet fail back into the
  // timeline — but its activity steps and log render in the chat, not here.
  const firstRunInChat = isQuickTask
    ? findFirstRunChatTurnRun(runs)
    : undefined;
  const firstRunStreamingToChat =
    firstRunInChat !== undefined && isRunInProgress(firstRunInChat.status);
  const timelineRuns =
    firstRunInChat && !firstRunStreamingToChat
      ? runs?.filter((run) => run._id !== firstRunInChat._id)
      : runs;

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
        devPort={task.devPort}
        devCommand={task.devCommand}
        owner={owner}
        panes={panes}
        terminalPanel={terminalPanel}
        prUrl={latestPrUrl}
        backgroundAgents={task.backgroundAgents}
        activeTab={activeSandboxTab}
        onTabChange={handleSandboxTabChange}
        onStartSandbox={
          canStartSandbox && !isSandboxStopping ? handleStartSandbox : undefined
        }
        isSandboxStarting={isSandboxStarting}
        collapsed={collapsed}
        onToggle={onToggle}
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

  const sandboxContent = (
    <SandboxWorkspace
      ownerKind="task"
      ownerId={taskId}
      storageScope={`task:${taskId}`}
      sandboxId={sandboxId}
      isActive={isSandboxActive}
      terminalPanes={task.terminalPanes}
    >
      {(panes, owner, terminalPanel) => (
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
              onOpenFile={openFile}
              onViewDiff={openDiffs}
              onOpenAgentsTab={() => {
                handleSandboxTabChange("agents");
                setExpandRightSignal((n) => n + 1);
              }}
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
          rightPanel={({ rightPanelCollapsed, onToggleRightPanel }) =>
            sandboxRightPanel(
              panes,
              owner,
              terminalPanel,
              rightPanelCollapsed,
              onToggleRightPanel,
            )
          }
        />
      )}
    </SandboxWorkspace>
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
                      {task?.scheduledAt ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs font-normal text-muted-foreground"
                          >
                            <IconClock size={11} />
                            {status === "todo"
                              ? "Scheduled for"
                              : "Was scheduled for"}{" "}
                            {dayjs(task.scheduledAt).format("DD/MM/YYYY HH:mm")}
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
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        Activity
                        {isActivityBusy ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        ) : null}
                      </div>
                      <TaskSubscribers taskId={taskId} users={users} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col sm:mt-4">
                    <ActivityTimeline
                      taskId={taskId}
                      createdAt={task.createdAt}
                      creatorUser={creatorUser}
                      runs={timelineRuns}
                      {...(firstRunStreamingToChat && firstRunInChat
                        ? { activityInChatRunId: firstRunInChat._id }
                        : {})}
                      comments={comments}
                      taskActivity={taskActivity}
                      users={users}
                      streaming={streaming}
                      activeRunElapsed={activeRunElapsed}
                      isStopping={isStopping}
                      onStopConfirm={() =>
                        requestConfirm(
                          altHeld,
                          () => setShowStopConfirm(true),
                          handleStopExecution,
                        )
                      }
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
                hasActiveRun={hasActiveRun}
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
        status={status}
        hasActiveRun={hasActiveRun}
        latestPrUrl={latestPrUrl}
        latestPrError={latestPrError}
        latestDeployment={latestDeployment}
        executionError={executionError}
        isStarting={isStarting}
        canStartSandbox={canStartSandbox}
        isSandboxActive={isSandboxActive}
        isSandboxStarting={isSandboxStarting}
        isSandboxStopping={isSandboxStopping}
        isRetryingStartupCommands={isRetryingStartupCommands}
        canCreatePr={canCreatePr}
        isCreatingPr={isCreatingPr}
        onCreatePr={handleCreatePr}
        onStartSandbox={handleStartSandbox}
        onStopSandbox={handleStopSandbox}
        onRunStartupCommands={() =>
          requestConfirm(
            altHeld,
            () => setShowStartupCommandsConfirm(true),
            handleRetryStartupCommands,
          )
        }
        onRunDevServer={() =>
          requestConfirm(
            altHeld,
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
            altHeld,
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
        isAgentActive={isTaskAgentActive(task)}
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
              transition={motionFast}
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
              transition={motionFast}
            >
              {detailContent}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <StopConfirmDialog
        open={showStopConfirm}
        onOpenChange={setShowStopConfirm}
        onConfirm={handleStopExecution}
        isStopping={isStopping}
      />
      <ResolveConfirmDialog
        open={showResolveConfirm}
        onOpenChange={setShowResolveConfirm}
        onConfirm={handleResolveConflicts}
        isStarting={isStarting}
      />
      <StartupCommandsConfirmDialog
        open={showStartupCommandsConfirm}
        onOpenChange={setShowStartupCommandsConfirm}
        onConfirm={handleRetryStartupCommands}
        isStarting={isRetryingStartupCommands}
      />
      <RunDevServerConfirmDialog
        open={showRunDevServerConfirm}
        onOpenChange={setShowRunDevServerConfirm}
        onConfirm={handleRunDevServer}
        isRunning={isRunningDevServer}
        devCommandLabel={devServerCommandLabel}
      />
    </>
  );
}
