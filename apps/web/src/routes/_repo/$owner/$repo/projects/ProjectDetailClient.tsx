import { useState, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useChatTurnOpen } from "@/lib/components/chat/useChatTurnOpen";
import { useChatUnread } from "@/lib/components/sandbox/useChatUnread";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import { CenteredSpinner } from "@vvedantb/ui";
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
import { ProjectDetailHeaderActions } from "./_components/ProjectDetailHeaderActions";
import { ProjectDetailMainContent } from "./_components/ProjectDetailMainContent";
import { ProjectDetailSandboxContent } from "./_components/ProjectDetailSandboxContent";

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

  const project = useQuery(api.projects.get, { id: projectId });
  useEntityDocumentTitle(project?.title);

  const sandbox = useProjectSandbox(projectId);
  const {
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
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
  // The rail tab a reply thread opened over: ✕ on Replies returns to it.
  const [threadReturnTab, setThreadReturnTab] =
    useState<ProjectSandboxTab>("tasks");

  // A reply thread opens as the rail's Replies tab (`?thread=`), selected.
  const openThread = (messageId: string) => {
    if (!projectPathSegment) return;
    if (sandboxTab !== "replies") setThreadReturnTab(sandboxTab);
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/replies`,
      ),
      search: (prev) => ({ ...prev, thread: messageId }),
    });
    setExpandRightSignal((n) => n + 1);
  };

  // ✕ drops the Replies tab and goes back to the tab before it.
  const closeThread = () => {
    if (!projectPathSegment) return;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/${threadReturnTab}`,
      ),
      search: (prev) => ({ ...prev, thread: undefined }),
      replace: true,
    });
  };

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

  return (
    <PageWrapper
      title={
        <ProjectBreadcrumb projectId={project._id} title={project.title} />
      }
      /* Project / Sandbox live in the header. */
      titleAfter={
        projectPathSegment ? (
          <ProjectMainTabs
            projectHref={`${basePath}/projects/${projectPathSegment}`}
            activeTab={mainTab}
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
        <ProjectDetailHeaderActions
          projectId={projectId}
          project={project}
          repoId={repo._id}
          sandbox={sandbox}
          chatId={chatId}
          chatTurnOpen={chatTurnOpen}
        />
      }
    >
      <ProjectDetailMainContent
        projectId={projectId}
        project={project}
        mainTab={mainTab}
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
            onThreadOpen={openThread}
            onCloseThread={closeThread}
            openFile={openFile}
            openDiffs={openDiffs}
            openAgentsTab={openAgentsTab}
          />
        }
        basePath={basePath}
        isTaskOpen={selectedTaskStatus !== undefined}
        selectedTaskId={selectedTaskId}
        selectedTaskStatus={selectedTaskStatus}
      />
    </PageWrapper>
  );
}
