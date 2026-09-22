"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { BackgroundAgentEntry, Id, SandboxOwner } from "@eva/backend";
import {
  isSessionSandboxTab,
  type SandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";
import { useNavigate, useParams } from "@tanstack/react-router";
import { entityPathSegment } from "@/lib/numId";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SandboxTabBar } from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabBar";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { type SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";
import { useSandboxPreview } from "@/lib/components/sandbox/useSandboxPreview";
import { useSandboxFileList } from "@/lib/components/sandbox/useSandboxFileList";
import { withBrowserTab } from "@/lib/components/sandbox/withBrowserTab";
import { SandboxPanelFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { useSubagentRoster } from "@/lib/components/sandbox/useSubagentRoster";
import { FilesPanel } from "@/routes/_repo/$owner/$repo/sessions/FilesPanel";
import { SandboxAgentsPanel } from "@/lib/components/sandbox/SandboxAgentsPanel";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { SimpleViewSandboxRedirect } from "@/lib/components/sandbox/SimpleViewSandboxRedirect";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  SessionArtifactsPanel,
  useSourceArtifacts,
} from "@/lib/components/artifacts/SessionArtifactsPanel";
import {
  SessionDocumentsPanel,
  useSourceDocuments,
} from "@/lib/components/docs/SessionDocumentsPanel";

interface ProjectSandboxPanelProps {
  projectId: Id<"projects">;
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
  /** Sub-agent lifecycle entries from the project doc (Agents tab). */
  backgroundAgents?: BackgroundAgentEntry[];
  sandboxTab: TaskRouteSandboxTab;
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function ProjectSandboxPanel({
  projectId,
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
  backgroundAgents,
  sandboxTab,
  onStartSandbox,
  isSandboxStarting,
  collapsed = false,
  onToggle,
}: ProjectSandboxPanelProps) {
  const simpleView = useSimpleView();
  const navigate = useNavigate();
  const { basePath } = useRepo();
  const projectPathSegment = entityPathSegment({ numId: projectNumId });
  const projectIdStr = String(projectId);

  const viewState = useQuery(api.sandboxPanes.getViewState, { owner });
  const setPreviewPath = useMutation(api.sandboxPanes.setPreviewPath);
  const setPreviewPort = useMutation(api.sandboxPanes.setPreviewPort);
  const setTerminalHistoryTail = useMutation(
    api.sandboxPanes.setTerminalHistoryTail,
  );
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);

  const activeTab: SandboxTab = sandboxTab;

  // Content-keyed Agents tab, folded from the chat transcript the project's
  // chat panel already subscribes to (same entity ids).
  const artifactSource = { kind: "project" as const, projectId };
  const { artifactCount } = useSourceArtifacts(artifactSource);
  const { documentCount } = useSourceDocuments(artifactSource);
  const { agents, hasAgents, hasRunningAgents } = useSubagentRoster({
    parentId: projectId,
    streamingEntityId: `project-chat-${projectIdStr}`,
    backgroundAgents,
    sandboxRunning: isActive,
  });

  const navigateToSandboxTab = (tab: SandboxTab) => {
    if (tab === "prd" || !projectPathSegment) return;
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
    sandboxId,
    isActive,
    repoId,
    devPort,
    onPortPersist: (port) => {
      void setPreviewPort({ owner, port });
    },
  });

  const fileList = useSandboxFileList({ sandboxId, repoId, isActive });

  // This surface has no custom tabs, so the tab bar only emits builtin ids.
  const handleTabChange = (tab: string) => {
    if (!isSessionSandboxTab(tab) || tab === "prd") return;
    navigateToSandboxTab(tab);
  };

  const enabledTabs = withBrowserTab(panes.enabledTabs);
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
            onNewPreview={() => {
              panes.handleNewPreview();
              navigateToSandboxTab("preview");
            }}
            newPreviewDisabled={panes.newPreviewDisabled}
            enabledTabs={enabledTabs}
            showFilesTab
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
            <SessionDocumentsPanel source={artifactSource} />
          </div>
          <div className={!simpleView && activeTab === "files" ? "h-full min-h-0" : "hidden"}>
            <FilesPanel
              sandboxId={sandboxId}
              repoId={repoId}
              isActive={isActive}
              fileList={fileList}
            />
          </div>
          <div
            className={
              !simpleView && activeTab === "agents" ? "h-full min-h-0" : "hidden"
            }
          >
            <SandboxAgentsPanel entity={{ kind: "project", projectId }} agents={agents} />
          </div>
          <SandboxPaneSlots
            activeTab={activeTab}
            panes={panes}
            preview={preview}
            owner={owner}
            sandboxId={sandboxId}
            isActive={isActive}
            repoId={repoId}
            cacheKey={projectIdStr}
            devCommand={devCommand}
            prUrl={prUrl}
            agentBrowsingAt={viewState?.agentBrowsingAt}
            onReleaseBrowserLock={() => void releaseBrowserLock({ owner })}
            // Backend starts the app in the Console tmux session after startup.
            runConsoleDevCommandOnConnect={false}
            onStartSandbox={onStartSandbox}
            isSandboxStarting={isSandboxStarting}
            stickyPreviewPath={viewState?.previewPath}
            onStickyPreviewPathChange={(path) => {
              void setPreviewPath({ owner, path });
            }}
            stickyTerminalHistoryTail={
              viewState === undefined
                ? undefined
                : (viewState?.terminalHistoryTail ?? "")
            }
            onStickyTerminalHistoryTailChange={(tail) => {
              void setTerminalHistoryTail({ owner, tail });
            }}
          />
        </div>
      </SandboxPanelFrame>
    </>
  );
}
