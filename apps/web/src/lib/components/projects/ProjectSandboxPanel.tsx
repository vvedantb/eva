"use client";

import type { Id, SandboxOwner } from "@eva/backend";
import { IconChecklist, IconMessages } from "@tabler/icons-react";
import { useQueryState } from "nuqs";
import { ReplyThreadList } from "@/lib/components/chat/replies/ReplyThreadList";
import { ReplyThreadView } from "@/lib/components/chat/replies/ReplyThreadView";
import { MESSAGE_LINK_PARAM } from "@eva/shared/messageLink";
import { messageLinkParser, replyThreadParser } from "@/lib/search-params";
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
import { useSandboxFileList } from "@/lib/components/sandbox/useSandboxFileList";
import { useSandboxRail } from "@/lib/components/sandbox/useSandboxRail";
import { withBrowserTab } from "@/lib/components/sandbox/withBrowserTab";
import { SandboxPanelFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { SandboxRailPanes } from "@/lib/components/sandbox/SandboxRailPanes";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { HiddenSandboxTabRedirect } from "@/lib/components/sandbox/HiddenSandboxTabRedirect";
import { sandboxChatKeys } from "@/lib/components/chat/sandboxChatTurn";
import type { OwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import { useProjectChatBinding } from "./ProjectSandboxChatPanel";
import { useSourceArtifacts } from "@/lib/components/artifacts/SessionArtifactsPanel";
import { useSourceDocuments } from "@/lib/components/docs/SessionDocumentsPanel";
import { useProjectDocuments } from "./useProjectDocuments";
import { ProjectTasksPanel } from "./ProjectTasksPanel";
import {
  isProjectSandboxTab,
  defaultProjectTaskTab,
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
  isArchived: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  title: string;
  onCloseThread: () => void;
  selectedTask: ProjectTaskListRow | undefined;
  selectedTaskLoading: boolean;
  openTaskIds: ReadonlySet<string>;
  onOpenTask: (taskNumId: number) => void;
  onAskEva: () => void;
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
  isArchived,
  collapsed = false,
  onToggle,
  title,
  onCloseThread,
  selectedTask,
  selectedTaskLoading,
  openTaskIds,
  onOpenTask,
  onAskEva,
}: ProjectSandboxPanelProps) {
  const [threadId, setThreadId] = useQueryState("thread", replyThreadParser);
  const [, setLinkedMessage] = useQueryState(
    MESSAGE_LINK_PARAM,
    messageLinkParser,
  );
  const navigate = useNavigate();
  const { basePath } = useRepo();
  const projectPathSegment = entityPathSegment({ numId: projectNumId });
  const chatBinding = useProjectChatBinding(projectId, projectSession);
  const rail = useSandboxRail({
    owner,
    sandboxId,
    isActive,
    repoId,
    devPort,
    devCommand,
    binding: chatBinding,
  });
  const chatKeys = sandboxChatKeys(chatBinding.entity);

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
      : selectedTask
        ? defaultProjectTaskTab(selectedTask)
        : "tasks"
    : COORDINATOR_HIDDEN_TABS.has(sandboxTab) || isProjectTaskTab(sandboxTab)
      ? "tasks"
      : sandboxTab;
  const needsYouCount = taskStatus?.counts.blocked ?? 0;
  const tasksTab: SandboxTabDescriptor = {
    value: "tasks",
    label: "Tasks",
    icon: { kind: "component", Icon: IconChecklist },
    count: needsYouCount > 0 ? needsYouCount : undefined,
    indicatorLabel:
      needsYouCount > 0
        ? `${needsYouCount} ${needsYouCount === 1 ? "task needs" : "tasks need"} you`
        : undefined,
  };

  const artifactSource = { kind: "project" as const, projectId };
  const { artifactCount } = useSourceArtifacts(artifactSource);
  const { documentCount } = useSourceDocuments(artifactSource);
  const { agents, hasAgents, hasRunningAgents } = rail.roster;

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
        <HiddenSandboxTabRedirect
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
            enabledTabs={taskSelected ? [] : enabledTabs}
            leadingTabs={
              taskTabs.length > 0
                ? projectTaskRailTabs(taskTabs)
                : taskSelected
                  ? [tasksTab]
                  : [tasksTab, REPLIES_TAB]
            }
            showArtifactsTab={!taskSelected}
            showDocumentsTab={!taskSelected}
            showAgentsTab={!taskSelected && hasAgents}
            hasRunningAgents={hasRunningAgents}
            artifactCount={artifactCount}
            documentCount={documentCount}
            agentBrowsingAt={rail.agentBrowsingAt}
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
              onAskEva={onAskEva}
            />
          </KeepAlivePane>
          {selectedTask && projectPathSegment && isProjectTaskTab(activeTab) ? (
            <ProjectTaskPane
              key={selectedTask._id}
              row={selectedTask}
              tab={activeTab}
              fullPageHref={`${basePath}/projects/${projectPathSegment}/${selectedTask.numId}`}
              collapsed={collapsed}
              onSelectTab={navigateToSandboxTab}
            />
          ) : null}
          <KeepAlivePane
            active={activeTab === "replies"}
            className="flex h-full min-h-0 flex-col overflow-hidden"
          >
            {chatKeys.parentId ? (
              threadId ? (
                <ReplyThreadView
                  rootId={threadId}
                  chatParentId={chatKeys.parentId}
                  repo={{ id: repoId, basePath }}
                  model={chatBinding.model}
                  isOpen={activeTab === "replies"}
                  onOpen={(rootId) => {
                    void setThreadId(rootId);
                    void setLinkedMessage(rootId);
                  }}
                  onClose={onCloseThread}
                />
              ) : (
                <ReplyThreadList
                  chatParentId={chatKeys.parentId}
                  onOpen={(rootId) => void setThreadId(rootId)}
                />
              )
            ) : null}
          </KeepAlivePane>
          <SandboxRailPanes
            activeTab={activeTab}
            artifactSource={artifactSource}
            projectDocuments={projectDocuments}
            agents={{
              entity: chatBinding.entity,
              list: agents,
              isReadOnly: isArchived,
            }}
          />
          <ReviewChatTargetProvider value={rail.reviewTarget}>
            <SandboxPaneSlots
              {...rail.paneSlots}
              activeTab={activeTab}
              panes={panes}
              cacheKey={String(projectId)}
              prUrl={prUrl}
              onStartSandbox={onStartSandbox}
              isSandboxStarting={isSandboxStarting}
              autoWakeEligible={autoWakeEligible}
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
            />
          </ReviewChatTargetProvider>
        </div>
      </SandboxPanelFrame>
    </>
  );
}
