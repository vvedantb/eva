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
  visibleProjectTaskTabs,
  type ProjectSandboxTab,
} from "./projectSandboxTabs";
import {
  useProjectTaskStatus,
  type ProjectTaskListRow,
} from "./useProjectStatus";
import { ProjectTaskPane } from "./ProjectTaskPane";
import { projectTaskRailTabs } from "./useProjectTaskTabs";

const COORDINATOR_HIDDEN_TABS: ReadonlySet<string> = new Set([
  "preview",
  "browser",
  "review",
  "computer",
  "editor",
  "files",
]);

const REPLIES_TAB: SandboxTabDescriptor = {
  value: "replies",
  label: "Replies",
  icon: { kind: "component", Icon: IconMessages },
};

interface ProjectSandboxPanelProps {
  projectId: Id<"projects">;
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
  autoWakeEligible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  title: string;
  onCloseThread: () => void;
  selectedTask: ProjectTaskListRow | undefined;
  selectedTaskLoading: boolean;
  openTaskIds: ReadonlySet<string>;
  onOpenTask: (taskNumId: number) => void;
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
  selectedTask,
  selectedTaskLoading,
  openTaskIds,
  onOpenTask,
}: ProjectSandboxPanelProps) {
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
  const { status: taskStatus } = useProjectTaskStatus(
    projectId,
    repoId,
  );
  const taskSelected = selectedTask !== undefined || selectedTaskLoading;
  const taskTabs = selectedTask ? visibleProjectTaskTabs(selectedTask) : [];
  const activeTab: ProjectSandboxTab = taskSelected
    ? isProjectTaskTab(sandboxTab) && taskTabs.includes(sandboxTab)
      ? sandboxTab
      : "task-details"
    : COORDINATOR_HIDDEN_TABS.has(sandboxTab) ||
        isProjectTaskTab(sandboxTab) ||
        (sandboxTab === "replies" && !threadId)
      ? "tasks"
      : sandboxTab;
  const triageCount = taskStatus?.counts.triage ?? 0;
  const tasksTab: SandboxTabDescriptor = {
    value: "tasks",
    label: "Tasks",
    icon: { kind: "component", Icon: IconChecklist },
    count: triageCount > 0 ? triageCount : undefined,
    indicatorLabel:
      triageCount > 0 ? `${triageCount} tasks in Triage` : undefined,
  };

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
            // A task tab's rail holds its own tabs only.
            enabledTabs={taskSelected ? [] : enabledTabs}
            leadingTabs={
              taskSelected
                ? projectTaskRailTabs(taskTabs)
                : threadId
                  ? [tasksTab, REPLIES_TAB]
                  : [tasksTab]
            }
            showArtifactsTab={!taskSelected}
            showDocumentsTab={!taskSelected}
            showAgentsTab={!taskSelected && hasAgents}
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
              openTaskIds={openTaskIds}
              onOpenTask={onOpenTask}
            />
          </KeepAlivePane>
          {selectedTask && projectPathSegment && isProjectTaskTab(activeTab) ? (
            <ProjectTaskPane
              key={selectedTask._id}
              taskId={selectedTask._id}
              numId={selectedTask.numId}
              title={selectedTask.title}
              prUrl={selectedTask.prUrl}
              tab={activeTab}
              fullPageHref={`${basePath}/projects/${projectPathSegment}/${selectedTask.numId}`}
              collapsed={collapsed}
              onSelectTab={navigateToSandboxTab}
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
              runConsoleDevCommandOnConnect={false}
              onStartSandbox={onStartSandbox}
              isSandboxStarting={isSandboxStarting}
              autoWakeEligible={autoWakeEligible}
              onAnnotationSubmit={submitAnnotation}
              presenceEnabled={!collapsed}
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
