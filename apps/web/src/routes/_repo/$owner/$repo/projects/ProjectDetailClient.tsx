import { useRef, useState, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DialogBody,
  Spinner,
  toast,
} from "@eva/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import {
  convexErrorPresentation,
  errorToneClassName,
  type ConvexErrorPresentation,
} from "@/lib/utils/convexErrorMessage";
import type { Id, SandboxOwner } from "@eva/backend";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { ProjectTabs } from "@/lib/components/projects/ProjectTabs";
import { ProjectActiveLayout } from "@/lib/components/projects/ProjectActiveLayout";
import {
  ProjectMainTabs,
  type ProjectMainTab,
} from "@/lib/components/projects/ProjectMainTabs";
import { ProjectOverviewTab } from "@/lib/components/projects/ProjectOverviewTab";
import { ProjectSandboxPanel } from "@/lib/components/projects/ProjectSandboxPanel";
import { ProjectSandboxChatPanel } from "@/lib/components/projects/ProjectSandboxChatPanel";
import { useProjectSandbox } from "@/lib/components/projects/useProjectSandbox";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { SleepEvaButton } from "@/lib/components/sandbox/SleepEvaButton";
import { SANDBOX_RAIL_WIDTH_PX } from "@/lib/components/sandbox/sandboxRail";
import { SandboxEmptyRailFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import type { SandboxSurface } from "@/lib/components/sandbox/SandboxSurfaceTabs";
import {
  SandboxWorkspace,
  type TerminalPanelApi,
} from "@/lib/components/sandbox/SandboxWorkspace";
import type { SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import { ProjectContextUsage } from "@/lib/components/context-usage";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { CopyLinkMenuItem } from "@/lib/components/CopyLinkButton";
import { ProjectBreadcrumb } from "./_components/ProjectBreadcrumb";

import {
  IconGitPullRequest,
  IconHammer,
  IconPlayerStop,
  IconTerminal2,
  IconLoader2,
  IconChevronDown,
  IconCalendarClock,
  IconBrandVercel,
  IconDots,
  IconRefresh,
  IconFileText,
  IconMessage,
  IconServerBolt,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { ScheduleBuildPopover } from "@/lib/components/projects/ScheduleBuildPopover";
import { BUILDABLE_PROJECT_PHASES } from "@/lib/components/projects/ProjectPhaseBadge";
import { StopConfirmDialog } from "@/lib/components/tasks/_components/StopConfirmDialog";
import { ResolveConfirmDialog } from "@/lib/components/tasks/_components/ResolveConfirmDialog";
import { StartupCommandsConfirmDialog } from "@/lib/components/tasks/_components/StartupCommandsConfirmDialog";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import type { EntityResolveStatus } from "@/lib/numId";
import { parseSpec } from "@/lib/utils/parseSpec";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import { ProjectChatMessageList } from "@/lib/components/projects/ProjectChatMessageList";
import { withMutationToast } from "@/lib/utils/mutationToast";

export function ProjectDetailClient({
  projectId,
  projectNumId,
  surface,
  sandboxTab,
  selectedTaskId,
  selectedTaskStatus,
  detailTab,
  mainTab = "work",
}: {
  projectId: Id<"projects">;
  projectNumId?: number;
  surface: SandboxSurface;
  sandboxTab?: TaskRouteSandboxTab;
  /** Primary tab. `work` is the index route, so deep links keep working. */
  mainTab?: ProjectMainTab;
  selectedTaskId?: Id<"agentTasks">;
  /** Resolve status of selectedTaskId's numId; undefined when no task is selected. */
  selectedTaskStatus?: EntityResolveStatus;
  detailTab?: TaskDetailTab;
}) {
  const navigate = useNavigate();
  const { basePath, repo } = useRepo();
  const simpleView = useSimpleView();
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [isStartingBuild, setIsStartingBuild] = useState(false);
  const [isStoppingBuild, setIsStoppingBuild] = useState(false);
  const [showStopBuildConfirm, setShowStopBuildConfirm] = useState(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [showStartupCommandsConfirm, setShowStartupCommandsConfirm] =
    useState(false);
  const altHeld = useAltHeld();
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [isResolvingConflicts, setIsResolvingConflicts] = useState(false);
  const [prError, setPrError] = useState<ConvexErrorPresentation | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const startBuild = useMutation(api.buildWorkflow.startBuild);
  const cancelBuild = useMutation(api.buildWorkflow.cancelBuild);
  const resolveProjectConflicts = useMutation(
    api.projects.resolveProjectConflicts,
  );
  const createProjectPrAction = useAction(
    api.taskWorkflowActions.createProjectPr,
  );

  const project = useQuery(api.projects.get, { id: projectId });
  const streaming = useQuery(api.streaming.get, { entityId: projectId });
  const latestDeployment = useQuery(
    api.agentRuns.getLatestDeploymentByProject,
    { projectId: projectId },
  );

  const {
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    sandboxId: projectSandboxId,
    handleStartSandbox,
    handleStopSandbox,
    handleRetryStartupCommands,
    isRetryingStartupCommands,
    handleRunBackgroundCommands,
    isRunningBackgroundCommands,
  } = useProjectSandbox(
    projectId,
    project?.phase,
    project?.sandboxId,
    project?.reviewProjectSandboxStatus,
  );

  const prewarmChatDaemon = useMutation(
    api.projectChatWorkflow.prewarmChatDaemon,
  );
  useEffect(() => {
    if (!isSandboxActive || !projectSandboxId) return;
    void prewarmChatDaemon({ projectId });
  }, [projectId, isSandboxActive, projectSandboxId, prewarmChatDaemon]);

  const isSandboxSurface = surface === "sandbox";

  const projectPathSegment = entityPathSegment({ numId: projectNumId });

  // Chat file chips → Files tab + `?file=` (same pattern as sessions).
  const openFile = (path: string) => {
    if (simpleView) return;
    if (!projectPathSegment) return;
    void navigate({
      to: `${basePath}/projects/${projectPathSegment}/sandbox/files`,
      search: (prev) => ({ ...prev, file: path }),
    });
  };

  // Auto-switch to Browser + expand sandbox panel on lock transition only
  // (undefined → set). Mirrors SessionDetailClient's pattern. Don't fight the
  // user if they switch away mid-lock.
  const prevAgentBrowsingAt = useRef<number | undefined>(undefined);
  const [expandRightSignal, setExpandRightSignal] = useState(0);
  const agentBrowsingAt =
    project === null || project === undefined
      ? undefined
      : project.agentBrowsingAt;
  useEffect(() => {
    const prev = prevAgentBrowsingAt.current;
    prevAgentBrowsingAt.current = agentBrowsingAt;
    if (agentBrowsingAt === undefined || prev !== undefined) return;
    if (!projectPathSegment) return;
    void navigate({
      to: `${basePath}/projects/${projectPathSegment}/sandbox/browser`,
      search: true,
    });
    setExpandRightSignal((n) => n + 1);
    // Full deps are safe: the ref guard above makes re-runs no-ops, and a
    // disable comment here makes React Compiler skip the whole file.
  }, [agentBrowsingAt, basePath, navigate, projectPathSegment]);

  // Chat sub-agent CTA row → Agents tab + expand the sandbox pane (same shape
  // as SessionDetailClient's onOpenAgentsTab; the tab is a route segment here).
  const openAgentsTab = () => {
    if (!projectPathSegment) return;
    void navigate({
      to: `${basePath}/projects/${projectPathSegment}/sandbox/agents`,
      search: true,
    });
    setExpandRightSignal((n) => n + 1);
  };

  const handleStopBuild = async () => {
    if (!project) return;
    setIsStoppingBuild(true);
    try {
      await cancelBuild({ projectId: projectId });
    } catch (err) {
      console.error("Failed to stop build:", err);
      toast.error("Could not stop the build. Try again.");
    }
    setIsStoppingBuild(false);
  };

  const handleCreatePr = async () => {
    setPrError(null);
    setIsCreatingPr(true);
    try {
      await createProjectPrAction({ projectId: projectId });
    } catch (err) {
      setPrError(convexErrorPresentation(err, "Failed to create PR"));
    }
    setIsCreatingPr(false);
  };

  const handleResolveConflicts = async () => {
    setPrError(null);
    setIsResolvingConflicts(true);
    try {
      await resolveProjectConflicts({ projectId: projectId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resolve conflicts";
      setPrError({ message, tone: "error" });
    }
    setIsResolvingConflicts(false);
  };

  if (project === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (project === null) {
    return (
      <EntityNotFound entityLabel="project" backTo={`${basePath}/projects`} />
    );
  }

  const isDraftOrFinalized =
    project.phase === "draft" || project.phase === "finalized";
  const canBuildProject = BUILDABLE_PROJECT_PHASES.includes(project.phase);

  const hasDeployedPreview =
    latestDeployment?.deploymentStatus === "deployed" &&
    Boolean(latestDeployment.deploymentUrl);
  const canCreatePr =
    !project.prUrl &&
    !project.activeBuildWorkflowId &&
    (project.phase === "business_review" || project.phase === "in_progress");
  const showRetryStartupCommands =
    canStartSandbox && !isSandboxStarting && !isSandboxStopping;
  const showRunBackgroundCommands = isSandboxActive;
  const showResolveConflicts =
    Boolean(project.prUrl) &&
    !project.activeBuildWorkflowId &&
    (project.phase === "business_review" || project.phase === "code_review");
  const parsedSpec = (() => {
    if (!project.generatedSpec) return null;
    try {
      return parseSpec(project.generatedSpec);
    } catch {
      return null;
    }
  })();
  const hasPlanContext = Boolean(parsedSpec);
  const hasSandboxCommandItems =
    showRetryStartupCommands || showRunBackgroundCommands;
  const hasPrLinkItems =
    canCreatePr || Boolean(project.prUrl) || hasDeployedPreview;

  const tab = sandboxTab ?? "preview";
  // Always mount the sandbox panel when the project can have one so tabs
  // stay reachable while stopped — same as sessions. Panes self-gate.
  const projectSandboxPanel = (
    panes: SandboxPanesApi,
    owner: SandboxOwner,
    terminalPanel: TerminalPanelApi,
    collapsed: boolean,
    onToggle: () => void,
  ) =>
    canStartSandbox ||
    projectSandboxId ||
    isSandboxActive ||
    isSandboxStarting ||
    isSandboxStopping ? (
      <ProjectSandboxPanel
        projectId={projectId}
        projectNumId={projectNumId}
        sandboxId={projectSandboxId}
        isActive={isSandboxActive}
        repoId={repo._id}
        prUrl={project.prUrl}
        devPort={project.devPort}
        devCommand={project.devCommand}
        owner={owner}
        panes={panes}
        terminalPanel={terminalPanel}
        backgroundAgents={project.backgroundAgents}
        sandboxTab={tab}
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
          <IconTerminal2 size={32} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Sandbox is not available for this project yet
          </p>
        </div>
      </SandboxEmptyRailFrame>
    );

  const projectSandboxContent = (
    <SandboxWorkspace
      ownerKind="project"
      ownerId={projectId}
      storageScope={`project:${projectId}`}
      sandboxId={projectSandboxId}
      isActive={isSandboxActive}
      terminalPanes={project.terminalPanes}
    >
      {(panes, owner, terminalPanel) => (
        <ResizablePanelLayout
          storageKey="project-sandbox-panel"
          leftDefaultSize="40%"
          leftMinWidthPx={350}
          rightMinWidthPx={300}
          rightCollapsedSizePx={SANDBOX_RAIL_WIDTH_PX}
          defaultRightCollapsed={false}
          expandRightSignal={expandRightSignal}
          mobilePaneLabels={{ left: "Chat", right: "Sandbox" }}
          leftPanel={() => (
            <ProjectSandboxChatPanel
              projectId={projectId}
              isSandboxActive={isSandboxActive}
              isSandboxToggling={isSandboxStarting || isSandboxStopping}
              onOpenFile={openFile}
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
          rightPanel={({ rightPanelCollapsed, onToggleRightPanel }) =>
            projectSandboxPanel(
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

  return (
    <PageWrapper
      title={
        <ProjectBreadcrumb projectId={project._id} title={project.title} />
      }
      /* Overview / Tasks / Sandbox live in the header — replaces the old
         Project|Sandbox surface switcher and the secondary tab strip. */
      titleAfter={
        projectPathSegment ? (
          <ProjectMainTabs
            projectHref={`${basePath}/projects/${projectPathSegment}`}
            activeTab={isSandboxSurface ? "sandbox" : mainTab}
            workTabLabel={isDraftOrFinalized ? "Plan" : "Tasks"}
            showSandbox={canStartSandbox && !isDraftOrFinalized}
            isSandboxActive={isSandboxActive}
            isSandboxStarting={isSandboxStarting}
            isSandboxStopping={isSandboxStopping}
          />
        ) : null
      }
      fillHeight
      childPadding={false}
      headerRight={
        !isDraftOrFinalized ? (
          <div className="flex max-sm:min-w-0 flex-col items-end gap-1">
            {prError && (
              <p className={`text-xs ${errorToneClassName(prError.tone)}`}>
                {prError.message}
              </p>
            )}
            <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
              <ProjectContextUsage repoId={repo._id} projectId={projectId} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon-sm" aria-label="More">
                    <IconDots size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {showResolveConflicts && (
                    <DropdownMenuItem
                      title={skipConfirmTitle("Resolve Conflicts")}
                      onClick={() =>
                        requestConfirm(
                          altHeld,
                          () => setShowResolveConfirm(true),
                          () => {
                            void handleResolveConflicts();
                          },
                        )
                      }
                      disabled={isResolvingConflicts}
                    >
                      {isResolvingConflicts ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconHammer size={14} />
                      )}
                      Resolve Conflicts
                      <ConfirmSkipHint />
                    </DropdownMenuItem>
                  )}
                  {showResolveConflicts && hasSandboxCommandItems ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  {showRetryStartupCommands && (
                    <DropdownMenuItem
                      title={skipConfirmTitle("Run Startup Commands")}
                      onClick={() =>
                        requestConfirm(
                          altHeld,
                          () => setShowStartupCommandsConfirm(true),
                          handleRetryStartupCommands,
                        )
                      }
                      disabled={isRetryingStartupCommands}
                    >
                      {isRetryingStartupCommands ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconRefresh size={14} />
                      )}
                      Run Startup Commands
                      <ConfirmSkipHint />
                    </DropdownMenuItem>
                  )}
                  {showRunBackgroundCommands && (
                    <DropdownMenuItem
                      onClick={handleRunBackgroundCommands}
                      disabled={isRunningBackgroundCommands}
                    >
                      {isRunningBackgroundCommands ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconServerBolt size={14} />
                      )}
                      Run Background Commands
                    </DropdownMenuItem>
                  )}
                  {(showResolveConflicts || hasSandboxCommandItems) &&
                  hasPrLinkItems ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  {canCreatePr && (
                    <DropdownMenuItem
                      onClick={handleCreatePr}
                      disabled={isCreatingPr}
                    >
                      {isCreatingPr ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconGitPullRequest size={14} />
                      )}
                      Create PR
                    </DropdownMenuItem>
                  )}
                  {project.prUrl ? (
                    <DropdownMenuItem asChild>
                      <a
                        href={project.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <IconGitPullRequest size={14} />
                        View PR
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  {hasDeployedPreview && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <DropdownMenuItem disabled>
                            <IconBrandVercel size={14} />
                            View Preview
                          </DropdownMenuItem>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Please start sandbox and view changes through the
                        preview tab there instead
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {hasPlanContext && (
                    <>
                      {(showResolveConflicts ||
                        hasSandboxCommandItems ||
                        hasPrLinkItems) && <DropdownMenuSeparator />}
                      <DropdownMenuItem onClick={() => setShowPlanModal(true)}>
                        <IconFileText size={14} />
                        View Plan
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowChatModal(true)}>
                        <IconMessage size={14} />
                        View Interview History
                      </DropdownMenuItem>
                    </>
                  )}
                  {(showResolveConflicts ||
                    hasSandboxCommandItems ||
                    hasPrLinkItems ||
                    hasPlanContext) && <DropdownMenuSeparator />}
                  <CopyLinkMenuItem />
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Inert while a chat turn is in flight — see `SleepEvaButton`.
                  A running build keeps its own confirmed "Stop Build", so it is
                  not gated here. Hidden on the sandbox surface, which has its
                  own stop control in the chat header. */}
              {isSandboxActive && !isSandboxStopping && !isSandboxSurface ? (
                <SleepEvaButton
                  onStop={handleStopSandbox}
                  isStopping={isSandboxStopping}
                  blockedMidTurn={Boolean(project?.activeChatWorkflowId)}
                  size="sm"
                />
              ) : null}
              {canBuildProject ? (
                project.activeBuildWorkflowId ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    aria-label="Stop build"
                    title={skipConfirmTitle("Stop Build")}
                    onClick={() =>
                      requestConfirm(
                        altHeld,
                        () => setShowStopBuildConfirm(true),
                        () => {
                          void handleStopBuild();
                        },
                      )
                    }
                    disabled={isStoppingBuild}
                  >
                    {isStoppingBuild ? (
                      <IconLoader2
                        size={16}
                        className="animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <IconPlayerStop size={16} aria-hidden />
                    )}
                    <span className="hidden sm:inline">Stop Build</span>
                    <ConfirmSkipHint />
                  </Button>
                ) : (
                  <SplitBuildButton
                    projectId={projectId}
                    scheduledBuildAt={project.scheduledBuildAt}
                    hasActiveBuild={!!project.activeBuildWorkflowId}
                    onBuild={() => setIsBuildModalOpen(true)}
                  />
                )
              ) : null}
            </div>
          </div>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {isSandboxSurface ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            {projectSandboxContent}
          </div>
        ) : mainTab === "overview" ? (
          <ProjectOverviewTab
            projectId={projectId}
            title={project.title}
            description={project.description}
          />
        ) : isDraftOrFinalized ? (
          <ProjectTabs
            projectId={projectId}
            projectPhase={project.phase}
            activeWorkflowId={project.activeWorkflowId}
            rawInput={project.rawInput}
            generatedSpec={project.generatedSpec}
            conversationHistory={project.conversationHistory}
            streamingActivity={streaming?.currentActivity}
            sandboxStartupActivity={sandboxStartupActivity}
            basePath={basePath}
            repoId={repo._id}
          />
        ) : (
          <ProjectActiveLayout
            projectId={projectId}
            project={project}
            basePath={basePath}
            selectedTaskId={selectedTaskId}
            selectedTaskStatus={selectedTaskStatus}
            detailTab={detailTab}
          />
        )}
      </div>

      <Dialog
        open={isBuildModalOpen}
        onOpenChange={(v) => {
          if (!v) setIsBuildModalOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Eva</DialogTitle>
          </DialogHeader>
          <div>
            <p className="text-muted-foreground">
              This will allow Eva to autonomously work through all tasks in
              sequence until the project is fully built.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Best suited for projects with well-defined requirements. If Eva
              makes an error on an earlier task, it may carry forward into
              subsequent tasks.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsBuildModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isStartingBuild}
              onClick={async () => {
                setIsStartingBuild(true);
                try {
                  await withMutationToast(
                    startBuild({
                      projectId: projectId,
                    }),
                    "Build started",
                    "Couldn't start build",
                    "project-build-start",
                  );
                  setIsBuildModalOpen(false);
                } catch {
                  setIsStartingBuild(false);
                  return;
                }
                setIsStartingBuild(false);
              }}
            >
              <IconHammer size={16} />
              {isStartingBuild ? "Starting..." : "Start cooking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StopConfirmDialog
        open={showStopBuildConfirm}
        onOpenChange={setShowStopBuildConfirm}
        onConfirm={handleStopBuild}
        isStopping={isStoppingBuild}
      />

      <ResolveConfirmDialog
        open={showResolveConfirm}
        onOpenChange={setShowResolveConfirm}
        onConfirm={handleResolveConflicts}
        isStarting={isResolvingConflicts}
      />

      <StartupCommandsConfirmDialog
        open={showStartupCommandsConfirm}
        onOpenChange={setShowStartupCommandsConfirm}
        onConfirm={handleRetryStartupCommands}
        isStarting={isRetryingStartupCommands}
      />

      {parsedSpec && (
        <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Plan</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-lg">{parsedSpec.title}</h3>
                  <p className="text-muted-foreground">
                    {parsedSpec.description}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-medium">
                    Tasks ({parsedSpec.tasks.length})
                  </h4>
                  {parsedSpec.tasks.map((task, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-2 bg-muted rounded"
                    >
                      <span className="text-muted-foreground font-mono">
                        {i + 1}.
                      </span>
                      <span>{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showChatModal} onOpenChange={setShowChatModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="pb-4">
            <DialogTitle>
              <div className="flex items-center gap-2">
                <IconMessage size={20} />
                Interview History
                <span className="text-sm font-normal text-muted-foreground">
                  ({project.conversationHistory.length} messages)
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3 py-2">
              <ProjectChatMessageList messages={project.conversationHistory} />
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}

// `max-sm:h-10`: the two halves abut, so the `hit-target` bleed each `size="sm"`
// carries would be spent on the other half rather than on the tap target.
const SPLIT_BUTTON_HALF =
  "hover:translate-y-0 active:scale-100 group-hover/split:bg-primary/92 max-sm:h-10";

function SplitBuildButton({
  projectId,
  scheduledBuildAt,
  hasActiveBuild,
  onBuild,
}: {
  projectId: Id<"projects">;
  scheduledBuildAt: number | undefined;
  hasActiveBuild: boolean;
  onBuild: () => void;
}) {
  const chevronRef = useRef<HTMLButtonElement>(null);
  const isScheduled = scheduledBuildAt !== undefined;
  // Hidden below `sm`, so it doubles as the button's accessible name there.
  const buildLabel = isScheduled
    ? dayjs(scheduledBuildAt).format("MMM D, h:mm A")
    : "Run Eva";

  // Halves cancel their own press so the wrapper scales as one unit — see the
  // twin in `TaskFooter`. `motion-press` replaces a hand-listed
  // `transition-[transform,background-color]` that named `transform` and so
  // never matched the `scale` property `scale-[0.96]` compiles to.
  return (
    <div className="group/split motion-press flex items-center active:scale-[0.96]">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              size="sm"
              aria-label={buildLabel}
              onClick={
                isScheduled ? () => chevronRef.current?.click() : onBuild
              }
              className={`rounded-r-none ${SPLIT_BUTTON_HALF}`}
            >
              {isScheduled ? (
                <IconCalendarClock size={16} aria-hidden />
              ) : (
                <IconHammer size={16} aria-hidden />
              )}
              <span className="hidden sm:inline">{buildLabel}</span>
            </Button>
          </div>
        </TooltipTrigger>
        {isScheduled ? (
          <TooltipContent>Click to change or remove schedule</TooltipContent>
        ) : null}
      </Tooltip>
      <ScheduleBuildPopover
        projectId={projectId}
        scheduledBuildAt={scheduledBuildAt}
        disabled={hasActiveBuild}
        trigger={
          <Button
            ref={chevronRef}
            size="sm"
            aria-label="Schedule build"
            disabled={hasActiveBuild}
            className={`rounded-l-none border-l border-l-primary-foreground/20 px-2 max-sm:px-3 ${SPLIT_BUTTON_HALF}`}
          >
            <IconChevronDown size={14} aria-hidden />
          </Button>
        }
      />
    </div>
  );
}
