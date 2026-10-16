import { useRef, useState, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useChatTurnOpen } from "@/lib/components/chat/useChatTurnOpen";
import { useChatUnread } from "@/lib/components/sandbox/useChatUnread";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import { CenteredSpinner, toast } from "@eva/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { convexErrorMessage } from "@/lib/utils/convexErrorMessage";
import type { Id } from "@eva/backend";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import {
  ProjectMainTabs,
  type ProjectMainTab,
} from "@/lib/components/projects/ProjectMainTabs";
import { useProjectSandbox } from "@/lib/components/projects/useProjectSandbox";
import { useSandboxRailWidthPx } from "@/lib/components/sandbox/useSandboxRailLabels";
import type { SandboxSurface } from "@/lib/components/sandbox/SandboxSurfaceTabs";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { usePrLinkMenuItems } from "@/lib/components/PrLinkMenuItems";
import { ProjectBreadcrumb } from "./_components/ProjectBreadcrumb";
import { useEntityDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { StopConfirmDialog } from "@/lib/components/tasks/_components/StopConfirmDialog";
import { ResolveConfirmDialog } from "@/lib/components/tasks/_components/ResolveConfirmDialog";
import { StartupCommandsConfirmDialog } from "@/lib/components/tasks/_components/StartupCommandsConfirmDialog";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import type { EntityResolveStatus } from "@/lib/numId";
import { useAltHeld } from "@/lib/confirm";
import {
  getAgentBrowsingAt,
  getProjectPrFlags,
  isProjectDraftOrFinalized,
  parseProjectSpec,
} from "./_components/projectDetailHelpers";
import { ProjectDetailHeaderActions } from "./_components/ProjectDetailHeaderActions";
import { ProjectDetailMainContent } from "./_components/ProjectDetailMainContent";
import { ProjectDetailSandboxContent } from "./_components/ProjectDetailSandboxContent";
import {
  ProjectInterviewHistoryDialog,
  ProjectPlanDialog,
  RunEvaDialog,
} from "./_components/ProjectDetailDialogs";

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
  const sandboxRailWidthPx = useSandboxRailWidthPx();
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
  const [prError, setPrError] = useState<string | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const cancelBuild = useMutation(api.buildWorkflow.cancelBuild);
  const resolveProjectConflicts = useMutation(
    api.projects.resolveProjectConflicts,
  );
  const createProjectPrAction = useAction(
    api.taskWorkflowActions.createProjectPr,
  );

  const project = useQuery(api.projects.get, { id: projectId });
  const chatTurnOpen = useChatTurnOpen(projectId);
  const chatUnread = useChatUnread(projectId);
  useEntityDocumentTitle(project?.title);
  const streaming = useQuery(api.streaming.get, { entityId: projectId });
  const latestDeployment = useQuery(
    api.agentRuns.getLatestDeploymentByProject,
    { projectId: projectId },
  );

  const sandbox = useProjectSandbox(
    projectId,
    project?.phase,
    project?.sandboxId,
    project?.reviewProjectSandboxStatus,
  );
  const {
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    sandboxId: projectSandboxId,
    handleRetryStartupCommands,
    isRetryingStartupCommands,
  } = sandbox;

  const prewarmChatDaemon = useMutation(
    api.projectChatWorkflow.prewarmChatDaemon,
  );
  useEffect(() => {
    if (!isSandboxActive || !projectSandboxId) return;
    void prewarmChatDaemon({ projectId });
  }, [projectId, isSandboxActive, projectSandboxId, prewarmChatDaemon]);

  const isSandboxSurface = surface === "sandbox";

  const projectPathSegment = entityPathSegment({ numId: projectNumId });
  const [expandRightSignal, setExpandRightSignal] = useState(0);

  // Chat file chips → Files tab + `?file=` (same pattern as sessions).
  const openFile = (path: string) => {
    if (simpleView) return;
    if (!projectPathSegment) return;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/files`,
      ),
      search: (prev) => ({ ...prev, file: path }),
    });
  };

  const openDiffs = (repoRelativePath?: string) => {
    if (simpleView) return;
    if (!projectPathSegment) return;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/review/diffs/unified`,
      ),
      search: (prev) => ({
        ...prev,
        ...(repoRelativePath ? { diffFile: repoRelativePath } : {}),
      }),
    });
    setExpandRightSignal((n) => n + 1);
  };

  // Auto-switch to Browser + expand sandbox panel on lock transition only
  // (undefined → set). Mirrors SessionDetailClient's pattern. Don't fight the
  // user if they switch away mid-lock.
  const prevAgentBrowsingAt = useRef<number | undefined>(undefined);
  const agentBrowsingAt = getAgentBrowsingAt(project);
  useEffect(() => {
    const prev = prevAgentBrowsingAt.current;
    prevAgentBrowsingAt.current = agentBrowsingAt;
    if (agentBrowsingAt === undefined || prev !== undefined) return;
    if (!projectPathSegment) return;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/browser`,
      ),
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
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/agents`,
      ),
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
      setPrError(convexErrorMessage(err, "Failed to create PR"));
    }
    setIsCreatingPr(false);
  };

  const { hasDeployedPreview, canCreatePr } = getProjectPrFlags(
    project,
    latestDeployment,
  );
  const prLinks = usePrLinkMenuItems({
    createPr: {
      enabled: canCreatePr,
      isCreating: isCreatingPr,
      onCreate: handleCreatePr,
    },
    prUrl: project?.prUrl,
    owner: { kind: "project", projectId },
    hasDeployment: hasDeployedPreview,
  });

  const handleResolveConflicts = async () => {
    setPrError(null);
    setIsResolvingConflicts(true);
    try {
      await resolveProjectConflicts({ projectId: projectId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resolve conflicts";
      setPrError(message);
    }
    setIsResolvingConflicts(false);
  };

  if (project === undefined) {
    return <CenteredSpinner label="Loading project" />;
  }

  if (project === null) {
    return (
      <EntityNotFound entityLabel="project" backTo={`${basePath}/projects`} />
    );
  }

  const isDraftOrFinalized = isProjectDraftOrFinalized(project);
  const parsedSpec = parseProjectSpec(project.generatedSpec);
  const hasPlanContext = Boolean(parsedSpec);

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
            hasUnread={chatUnread && chatTurnOpen !== true}
          />
        ) : null
      }
      fillHeight
      childPadding={false}
      headerRight={
        !isDraftOrFinalized ? (
          <ProjectDetailHeaderActions
            projectId={projectId}
            project={project}
            repoId={repo._id}
            sandbox={sandbox}
            chatTurnOpen={chatTurnOpen}
            altHeld={altHeld}
            prError={prError}
            prLinks={prLinks}
            hasPlanContext={hasPlanContext}
            isResolvingConflicts={isResolvingConflicts}
            isStoppingBuild={isStoppingBuild}
            onResolveConflicts={handleResolveConflicts}
            onStopBuild={handleStopBuild}
            setShowResolveConfirm={setShowResolveConfirm}
            setShowStartupCommandsConfirm={setShowStartupCommandsConfirm}
            setShowStopBuildConfirm={setShowStopBuildConfirm}
            setShowPlanModal={setShowPlanModal}
            setShowChatModal={setShowChatModal}
            setIsBuildModalOpen={setIsBuildModalOpen}
          />
        ) : null
      }
    >
      <ProjectDetailMainContent
        projectId={projectId}
        project={project}
        isSandboxSurface={isSandboxSurface}
        mainTab={mainTab}
        isDraftOrFinalized={isDraftOrFinalized}
        sandboxContent={
          <ProjectDetailSandboxContent
            projectId={projectId}
            projectNumId={projectNumId}
            project={project}
            repoId={repo._id}
            sandboxTab={sandboxTab}
            sandbox={sandbox}
            chatTurnOpen={chatTurnOpen}
            sandboxRailWidthPx={sandboxRailWidthPx}
            expandRightSignal={expandRightSignal}
            openFile={openFile}
            openDiffs={openDiffs}
            openAgentsTab={openAgentsTab}
          />
        }
        streamingActivity={streaming?.currentActivity}
        sandboxStartupActivity={sandboxStartupActivity}
        basePath={basePath}
        repoId={repo._id}
        selectedTaskId={selectedTaskId}
        selectedTaskStatus={selectedTaskStatus}
        detailTab={detailTab}
      />

      <RunEvaDialog
        projectId={projectId}
        open={isBuildModalOpen}
        setOpen={setIsBuildModalOpen}
        isStarting={isStartingBuild}
        setIsStarting={setIsStartingBuild}
      />

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
        <ProjectPlanDialog
          parsedSpec={parsedSpec}
          open={showPlanModal}
          onOpenChange={setShowPlanModal}
        />
      )}

      <ProjectInterviewHistoryDialog
        conversationHistory={project.conversationHistory}
        open={showChatModal}
        onOpenChange={setShowChatModal}
      />
    </PageWrapper>
  );
}
