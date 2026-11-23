import { useState, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useChatTurnOpen } from "@/lib/components/chat/useChatTurnOpen";
import { useChatUnread } from "@/lib/components/sandbox/useChatUnread";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import { Button, CenteredSpinner } from "@vvedantb/ui";
import { IconMessage } from "@tabler/icons-react";
import { ProjectStageBadge } from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectFeedbackModal } from "@/lib/components/projects/ProjectFeedbackModal";
import { useProjectTaskStatus } from "@/lib/components/projects/useProjectStatus";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { Id } from "@eva/backend";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import {
  ProjectMainTabs,
  type ProjectMainTab,
} from "@/lib/components/projects/ProjectMainTabs";
import { useProjectSandbox } from "@/lib/components/projects/useProjectSandbox";
import { useAgentBrowsingAutoSwitch } from "@/lib/components/sandbox/useSandboxLifecycle";
import { useSandboxRailWidthPx } from "@/lib/components/sandbox/useSandboxRailLabels";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { ProjectBreadcrumb } from "./_components/ProjectBreadcrumb";
import { useEntityDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import type { EntityResolveStatus } from "@/lib/numId";
import type { ProjectSandboxTab } from "@/lib/components/projects/projectSandboxTabs";
import {
  isProjectDraftOrFinalized,
  parseProjectSpec,
} from "./_components/projectDetailHelpers";
import { ProjectDetailHeaderActions } from "./_components/ProjectDetailHeaderActions";
import { ProjectDetailMainContent } from "./_components/ProjectDetailMainContent";
import { ProjectDetailSandboxContent } from "./_components/ProjectDetailSandboxContent";
import {
  ProjectInterviewHistoryDialog,
  ProjectPlanDialog,
} from "./_components/ProjectDetailDialogs";

export function ProjectDetailClient({
  projectId,
  projectNumId,
  sandboxTab,
  selectedTaskId,
  selectedTaskStatus,
  mainTab = "work",
}: {
  projectId: Id<"projects">;
  projectNumId?: number;
  /** The coordinator rail's tab (Tasks on the project index). */
  sandboxTab: ProjectSandboxTab;
  /** Primary tab. `work` is the index route, so deep links keep working. */
  mainTab?: ProjectMainTab;
  selectedTaskId?: Id<"agentTasks">;
  /** Resolve status of selectedTaskId's numId; undefined when no task is selected. */
  selectedTaskStatus?: EntityResolveStatus;
}) {
  const navigate = useNavigate();
  const { basePath, repo } = useRepo();
  const simpleView = useSimpleView();
  const sandboxRailWidthPx = useSandboxRailWidthPx();
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const project = useQuery(api.projects.get, { id: projectId });
  useEntityDocumentTitle(project?.title);
  const { status: projectStatus } = useProjectTaskStatus(projectId, repo._id);
  const streaming = useQuery(api.streaming.get, { entityId: projectId });

  const sandbox = useProjectSandbox(projectId);
  const {
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    sandboxId: projectSandboxId,
  } = sandbox;
  // The project chats in its session's Main chat; nothing before it exists.
  const chatId = sandbox.projectSession.owned?.chatId;
  const chatTurnOpen = useChatTurnOpen(chatId);
  const chatUnread = useChatUnread(chatId);

  const prewarmSessionChatDaemon = useMutation(
    api.sessionWorkflow.prewarmDaemon,
  );
  useEffect(() => {
    if (!isSandboxActive || !projectSandboxId || !chatId) return;
    void prewarmSessionChatDaemon({ chatId });
  }, [chatId, isSandboxActive, projectSandboxId, prewarmSessionChatDaemon]);

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

  useAgentBrowsingAutoSwitch(sandbox.sandbox.agentBrowsingAt, () => {
    if (!projectPathSegment) return;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/browser`,
      ),
      search: true,
    });
    setExpandRightSignal((n) => n + 1);
  });

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

  if (project === undefined) {
    return <CenteredSpinner label="Loading project" />;
  }

  if (project === null) {
    return (
      <EntityNotFound entityLabel="project" backTo={`${basePath}/projects`} />
    );
  }

  const isDraftOrFinalized = isProjectDraftOrFinalized(project);
  // Project roles are gone: everyone with repo access contributes.
  const canContribute = true;
  const parsedSpec = parseProjectSpec(project.generatedSpec);
  const hasPlanContext = Boolean(parsedSpec);

  return (
    <PageWrapper
      title={
        <ProjectBreadcrumb projectId={project._id} title={project.title} />
      }
      /* Overview / Coordinator (Plan while drafting) live in the header. */
      titleAfter={
        projectPathSegment ? (
          <ProjectMainTabs
            projectHref={`${basePath}/projects/${projectPathSegment}`}
            activeTab={mainTab}
            workTabLabel={isDraftOrFinalized ? "Plan" : "Coordinator"}
            showSandboxStatus={!isDraftOrFinalized}
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
        <div className="flex max-sm:min-w-0 items-center gap-1.5 sm:gap-2">
          {projectStatus ? (
            <ProjectStageBadge stage={projectStatus.stage} />
          ) : null}
          {!canContribute ? (
            <Button size="sm" onClick={() => setIsFeedbackOpen(true)}>
              <IconMessage size={16} aria-hidden />
              Feedback
            </Button>
          ) : !isDraftOrFinalized ? (
            <ProjectDetailHeaderActions
              projectId={projectId}
              project={project}
              repoId={repo._id}
              sandbox={sandbox}
              chatId={chatId}
              chatTurnOpen={chatTurnOpen}
              hasPlanContext={hasPlanContext}
              setShowPlanModal={setShowPlanModal}
              setShowChatModal={setShowChatModal}
            />
          ) : null}
        </div>
      }
    >
      <ProjectDetailMainContent
        projectId={projectId}
        project={project}
        mainTab={mainTab}
        isDraftOrFinalized={isDraftOrFinalized}
        coordinatorContent={
          <ProjectDetailSandboxContent
            projectId={projectId}
            projectNumId={projectNumId}
            project={project}
            repoId={repo._id}
            basePath={basePath}
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
        isTaskOpen={selectedTaskStatus !== undefined}
        selectedTaskId={selectedTaskId}
        selectedTaskStatus={selectedTaskStatus}
      />

      {parsedSpec && (
        <ProjectPlanDialog
          parsedSpec={parsedSpec}
          open={showPlanModal}
          onOpenChange={setShowPlanModal}
        />
      )}

      <ProjectFeedbackModal
        projectId={projectId}
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      <ProjectInterviewHistoryDialog
        conversationHistory={project.conversationHistory}
        open={showChatModal}
        onOpenChange={setShowChatModal}
      />
    </PageWrapper>
  );
}
