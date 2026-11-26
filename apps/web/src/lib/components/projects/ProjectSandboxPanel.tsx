"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { Id, SandboxOwner } from "@eva/backend";
import { IconChecklist, IconMessages } from "@tabler/icons-react";
import { useQueryState } from "nuqs";
import { ReplyThreadView } from "@/lib/components/chat/replies/ReplyThreadView";
import { replyThreadParser } from "@/lib/search-params";
import { KeepAlivePane } from "@/lib/components/sandbox/KeepAlivePane";
import type { SandboxTabDescriptor } from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabTrigger";
import { useNavigate, useParams } from "@tanstack/react-router";
import { entityPathSegment } from "@/lib/numId";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SandboxTabBar } from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabBar";
import { ReviewChatTargetProvider } from "@/lib/contexts/ReviewChatTargetContext";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { type SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";
import { useSandboxPreview } from "@/lib/components/sandbox/useSandboxPreview";
import { useSandboxFileList } from "@/lib/components/sandbox/useSandboxFileList";
import { withBrowserTab } from "@/lib/components/sandbox/withBrowserTab";
import { SandboxPanelFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { useSubagentRoster } from "@/lib/components/sandbox/useSubagentRoster";
import { SandboxAgentsPanel } from "@/lib/components/sandbox/SandboxAgentsPanel";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { SimpleViewSandboxRedirect } from "@/lib/components/sandbox/SimpleViewSandboxRedirect";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { useSandboxAnnotationSend } from "@/lib/components/chat/sandboxChatBinding";
import { sandboxChatKeys } from "@/lib/components/chat/sandboxChatTurn";
import type { OwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import { useProjectChatBinding } from "./ProjectSandboxChatPanel";
import {
  SessionArtifactsPanel,
  useSourceArtifacts,
} from "@/lib/components/artifacts/SessionArtifactsPanel";
import {
  SessionDocumentsPanel,
  useSourceDocuments,
} from "@/lib/components/docs/SessionDocumentsPanel";
import { useProjectDocuments } from "./useProjectDocuments";
import { ProjectTasksPanel } from "./ProjectTasksPanel";
import {
  isProjectSandboxTab,
  isProjectTaskTab,
  type ProjectSandboxTab,
} from "./projectSandboxTabs";
import { useProjectTaskStatus } from "./useProjectStatus";
import { ProjectTaskPane } from "./ProjectTaskPane";
import { useOpenProjectTask } from "./useOpenProjectTask";

/** Sandbox tabs a task's sandbox has but the coordinator's does not. */
const COORDINATOR_HIDDEN_TABS: ReadonlySet<string> = new Set([
  "preview",
  "browser",
  "review",
  "computer",
  "editor",
  "files",
]);

/** The rail tab of an open reply thread; same descriptor shape as Tasks. */
const REPLIES_TAB: SandboxTabDescriptor = {
  value: "replies",
  label: "Replies",
  icon: { kind: "component", Icon: IconMessages },
};

interface ProjectSandboxPanelProps {
  projectId: Id<"projects">;
  /** The project's session: its chat feeds the Agents tab and annotations. */
  projectSession: OwnedSession;
  projectNumId?: number;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  prUrl?: string;
  devPort?: number;
  devCommand?: string;
  owner: SandboxOwner;
  panes: SandboxPanesApi;
  terminalPanel: TerminalPanelApi;
  sandboxTab: ProjectSandboxTab;
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  /**
   * The sandbox is closed and the host would allow a Start: no last-start
   * error, not read-only, no run or build owning it. Combined in
   * SandboxPaneSlots with the setting and tab visibility to auto-wake.
   */
  autoWakeEligible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Mini-player title; Expand returns to this project's Preview tab. */
  title: string;
  /** ✕ on the Replies tab: drops the tab and returns to the tab before it. */
  onCloseThread: () => void;
  /** Opens a task in this panel (`?task=`), on its Chat tab. */
  onOpenTask: (taskNumId: number) => void;
  /** ✕ on an open task: drops its tabs and returns to Tasks. */
  onCloseTask: () => void;
}

export function ProjectSandboxPanel({
  projectId,
  projectSession,
  projectNumId,
  sandboxId,
  isActive,
  repoId,
  prUrl,
  devPort,
  devCommand,
  owner,
  panes,
  terminalPanel,
  sandboxTab,
  onStartSandbox,
  isSandboxStarting,
  autoWakeEligible,
  collapsed = false,
  onToggle,
  title,
  onCloseThread,
  onOpenTask,
  onCloseTask,
}: ProjectSandboxPanelProps) {
  // An open reply thread adds the Replies tab (projects v2, PR D).
  const [threadId, setThreadId] = useQueryState("thread", replyThreadParser);
  const simpleView = useSimpleView();
  const navigate = useNavigate();
  const { basePath } = useRepo();
  const projectPathSegment = entityPathSegment({ numId: projectNumId });
  const chatBinding = useProjectChatBinding(projectId, projectSession);
  const submitAnnotation = useSandboxAnnotationSend(chatBinding);
  const chatKeys = sandboxChatKeys(chatBinding.entity);

  const viewState = useQuery(api.sandboxPanes.getViewState, { owner });
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);

  const projectDocuments = useProjectDocuments(projectId, repoId);
  const { tasks, status: taskStatus } = useProjectTaskStatus(
    projectId,
    repoId,
  );
  const openTask = useOpenProjectTask(projectId, tasks);
  // The coordinator only reads code and delegates: no dev server, no edits,
  // so no Preview, Browser, Review, Computer, Editor or Files. An old link to one of
  // those lands on Tasks; a task's own sandbox keeps them all.
  // Replies without an open thread (an old link) lands on Tasks too, as
  // does a task tab without an open task.
  const activeTab: ProjectSandboxTab =
    COORDINATOR_HIDDEN_TABS.has(sandboxTab) ||
    (sandboxTab === "replies" && !threadId)
      ? "tasks"
      : isProjectTaskTab(sandboxTab)
        ? openTask.resolveTab(sandboxTab)
        : sandboxTab;
  const triageCount = taskStatus?.counts.triage ?? 0;
  // Tasks leads the rail; its badge counts what waits in Triage.
  const tasksTab: SandboxTabDescriptor = {
    value: "tasks",
    label: "Tasks",
    icon: { kind: "component", Icon: IconChecklist },
    count: triageCount > 0 ? triageCount : undefined,
    indicatorLabel:
      triageCount > 0 ? `${triageCount} tasks in Triage` : undefined,
  };

  // Content-keyed Agents tab, folded from the chat transcript the project's
  // chat panel already subscribes to (same entity ids). Artifacts stay on the
  // project: the backend files its session's artifacts under it.
  const artifactSource = { kind: "project" as const, projectId };
  const { artifactCount } = useSourceArtifacts(artifactSource);
  const { documentCount } = useSourceDocuments(artifactSource);
  const { agents, hasAgents, hasRunningAgents } = useSubagentRoster({
    parentId: chatKeys.parentId,
    streamingEntityId: chatKeys.streamingEntityId,
    backgroundAgents: chatBinding.doc?.backgroundAgents,
    sandboxRunning: isActive,
  });

  const navigateToSandboxTab = (tab: ProjectSandboxTab) => {
    if (!projectPathSegment) return;
    if (tab === "review") {
      void navigate({
        to: toInternalRepoHref(
          `${basePath}/projects/${projectPathSegment}/sandbox/review/diffs/unified`,
        ),
        search: true,
      });
      return;
    }
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/${tab}`,
      ),
      // Keep diffFile across sandbox tabs.
      search: true,
    });
  };

  const preview = useSandboxPreview({
    owner,
    sandboxId,
    isActive,
    repoId,
    devPort,
  });

  const fileList = useSandboxFileList({ sandboxId, repoId, isActive });

  // This surface has no custom tabs, so the tab bar only emits builtin ids.
  const handleTabChange = (tab: string) => {
    if (isProjectSandboxTab(tab)) navigateToSandboxTab(tab);
  };

  const enabledTabs = withBrowserTab(panes.enabledTabs).filter(
    (tab) => !COORDINATOR_HIDDEN_TABS.has(tab),
  );
  const { owner: ownerParam, repo: repoParam } = useParams({ strict: false });

  return (
    <>
      {projectPathSegment &&
      typeof ownerParam === "string" &&
      typeof repoParam === "string" ? (
        <SimpleViewSandboxRedirect
          activeTab={activeTab}
          to="/$owner/$repo/projects/$numId/sandbox/$sandboxTab"
          params={{
            owner: ownerParam,
            repo: repoParam,
            numId: projectPathSegment,
          }}
        />
      ) : null}
      <SandboxPanelFrame
        collapsed={collapsed}
        tabBar={
          <SandboxTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            collapsed={collapsed}
            onToggle={onToggle}
            newPreviewDisabled={panes.newPreviewDisabled}
            enabledTabs={enabledTabs}
            leadingTabs={threadId ? [tasksTab, REPLIES_TAB] : [tasksTab]}
            leadingGroup={openTask.railGroup}
            showAgentsTab={hasAgents}
            hasRunningAgents={hasRunningAgents}
            artifactCount={artifactCount}
            documentCount={documentCount}
            agentBrowsingAt={viewState?.agentBrowsingAt}
            fileList={fileList}
            consoleDock={panes.consoleDock}
            terminalPanel={terminalPanel}
          />
        }
      >
        <div className="h-full overflow-hidden">
          <KeepAlivePane
            active={activeTab === "tasks"}
            className="flex h-full min-h-0 flex-col overflow-hidden"
          >
            <ProjectTasksPanel
              projectId={projectId}
              projectNumId={projectNumId}
              repoId={repoId}
              basePath={basePath}
              openTaskId={openTask.row?._id}
              onOpenTask={onOpenTask}
            />
          </KeepAlivePane>
          {openTask.row && projectPathSegment ? (
            <ProjectTaskPane
              key={openTask.row._id}
              taskId={openTask.row._id}
              numId={openTask.row.numId}
              title={openTask.row.title}
              prUrl={openTask.row.prUrl}
              tab={isProjectTaskTab(activeTab) ? activeTab : null}
              fullPageHref={`${basePath}/projects/${projectPathSegment}/${openTask.row.numId}`}
              collapsed={collapsed}
              onSelectTab={navigateToSandboxTab}
              onClose={onCloseTask}
            />
          ) : null}
          <div
            className={
              activeTab === "replies"
                ? "flex h-full min-h-0 flex-col overflow-hidden"
                : "hidden"
            }
          >
            {threadId && chatKeys.parentId ? (
              <ReplyThreadView
                rootId={threadId}
                chatParentId={chatKeys.parentId}
                repo={{ id: repoId, basePath }}
                model={chatBinding.model}
                isOpen={activeTab === "replies"}
                onOpen={(rootId) => void setThreadId(rootId)}
                onClose={onCloseThread}
              />
            ) : null}
          </div>
          <div
            className={
              activeTab === "artifacts"
                ? "flex h-full min-h-0 flex-col overflow-hidden"
                : "hidden"
            }
          >
            <SessionArtifactsPanel source={artifactSource} />
          </div>
          <div
            className={
              activeTab === "documents"
                ? "flex h-full min-h-0 flex-col overflow-hidden"
                : "hidden"
            }
          >
            <SessionDocumentsPanel
              source={artifactSource}
              project={projectDocuments}
            />
          </div>
          <div
            className={
              !simpleView && activeTab === "agents"
                ? "h-full min-h-0"
                : "hidden"
            }
          >
            <SandboxAgentsPanel entity={chatBinding.entity} agents={agents} />
          </div>
          <ReviewChatTargetProvider value={chatKeys.draftTarget ?? null}>
            <SandboxPaneSlots
              activeTab={activeTab}
              panes={panes}
              preview={preview}
              owner={owner}
              sandboxId={sandboxId}
              isActive={isActive}
              repoId={repoId}
              cacheKey={String(projectId)}
              devCommand={devCommand}
              prUrl={prUrl}
              agentBrowsingAt={viewState?.agentBrowsingAt}
              onReleaseBrowserLock={() => void releaseBrowserLock({ owner })}
              // Backend starts the app in the Console tmux session after startup.
              runConsoleDevCommandOnConnect={false}
              onStartSandbox={onStartSandbox}
              isSandboxStarting={isSandboxStarting}
              autoWakeEligible={autoWakeEligible}
              onAnnotationSubmit={submitAnnotation}
              // A collapsed rail is not on screen: no presence beacon, no auto-wake.
              presenceEnabled={!collapsed}
              // A collapsed rail keeps its preview parked.
              miniPlayer={
                projectPathSegment && !collapsed
                  ? {
                      owner,
                      returnTo: `${basePath}/projects/${projectPathSegment}/sandbox/preview`,
                      title,
                    }
                  : undefined
              }
              viewState={viewState}
            />
          </ReviewChatTargetProvider>
        </div>
      </SandboxPanelFrame>
    </>
  );
}
