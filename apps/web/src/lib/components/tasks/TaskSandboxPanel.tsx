"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { BackgroundAgentEntry, Id, SandboxOwner } from "@eva/backend";
import { isSessionSandboxTab, type SandboxTab } from "@/lib/search-params";
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
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  SessionArtifactsPanel,
  useSourceArtifacts,
} from "@/lib/components/artifacts/SessionArtifactsPanel";
import {
  SessionDocumentsPanel,
  useSourceDocuments,
} from "@/lib/components/docs/SessionDocumentsPanel";

interface TaskSandboxPanelProps {
  taskId: Id<"agentTasks">;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  /**
   * Resolved dev port for the current sandbox (taken from `agentTasks.devPort`,
   * which `taskSandboxReady` populates from `startSessionServices` — already
   * accounts for any per-app override on the repo).
   */
  devPort?: number;
  /**
   * Full dev command for the current sandbox. Wired into the first terminal
   * pane so it auto-starts the dev server with the resolved PORT.
   */
  devCommand?: string;
  owner: SandboxOwner;
  panes: SandboxPanesApi;
  terminalPanel: TerminalPanelApi;
  prUrl?: string;
  /** Sub-agent lifecycle entries from the task doc (Agents tab). */
  backgroundAgents?: BackgroundAgentEntry[];
  activeTab: SandboxTab;
  onTabChange: (tab: SandboxTab) => void;
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

/**
 * Right-side sandbox panel for a quick task — mirrors the session sandbox
 * panel (Preview, Browser, Diffs, Files, Editor/Computer via +).
 * PRD stays session-only.
 *
 * All shared multi-pane / preview / PTY logic lives in the `sandbox/` module
 * so this file is just a thin orchestrator.
 */
export function TaskSandboxPanel({
  taskId,
  sandboxId,
  isActive,
  repoId,
  devPort,
  devCommand,
  owner,
  panes,
  terminalPanel,
  prUrl,
  backgroundAgents,
  activeTab,
  onTabChange,
  onStartSandbox,
  isSandboxStarting,
  collapsed = false,
  onToggle,
}: TaskSandboxPanelProps) {
  const simpleView = useSimpleView();
  const taskIdStr = String(taskId);

  // Content-keyed Agents tab, folded from the chat transcript the task's chat
  // panel already subscribes to (same entity ids).
  const artifactSource = { kind: "task" as const, taskId };
  const { artifactCount } = useSourceArtifacts(artifactSource);
  const { documentCount } = useSourceDocuments(artifactSource);
  const { agents, hasAgents, hasRunningAgents } = useSubagentRoster({
    parentId: taskId,
    streamingEntityId: `task-chat-${taskIdStr}`,
    backgroundAgents,
    sandboxRunning: isActive,
  });

  const viewState = useQuery(api.sandboxPanes.getViewState, { owner });
  const setPreviewPath = useMutation(api.sandboxPanes.setPreviewPath);
  const setPreviewPort = useMutation(api.sandboxPanes.setPreviewPort);
  const setTerminalHistoryTail = useMutation(
    api.sandboxPanes.setTerminalHistoryTail,
  );
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);

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

  useEffect(() => {
    if (activeTab !== "prd") return;
    onTabChange("preview");
  }, [activeTab, onTabChange]);

  const tabBarValue = activeTab === "prd" ? "preview" : activeTab;

  // This surface has no custom tabs, so the tab bar only emits builtin ids.
  const handleTabChange = (tab: string) => {
    if (!isSessionSandboxTab(tab) || tab === "prd") return;
    onTabChange(tab);
  };

  const enabledTabs = withBrowserTab(panes.enabledTabs);

  return (
    <SandboxPanelFrame
      collapsed={collapsed}
      tabBar={
        <SandboxTabBar
          activeTab={tabBarValue}
          onTabChange={handleTabChange}
          collapsed={collapsed}
          onToggle={onToggle}
        onNewPreview={() => {
          panes.handleNewPreview();
          onTabChange("preview");
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
            tabBarValue === "artifacts"
              ? "flex h-full min-h-0 flex-col overflow-hidden"
              : "hidden"
          }
        >
          <SessionArtifactsPanel source={artifactSource} />
        </div>
        <div
          className={
            tabBarValue === "documents"
              ? "flex h-full min-h-0 flex-col overflow-hidden"
              : "hidden"
          }
        >
          <SessionDocumentsPanel source={artifactSource} />
        </div>
        <div className={!simpleView && tabBarValue === "files" ? "h-full min-h-0" : "hidden"}>
          <FilesPanel
            sandboxId={sandboxId}
            repoId={repoId}
            isActive={isActive}
            fileList={fileList}
          />
        </div>
        <div
          className={
            !simpleView && tabBarValue === "agents" ? "h-full min-h-0" : "hidden"
          }
        >
          <SandboxAgentsPanel entity={{ kind: "task", taskId }} agents={agents} />
        </div>
        <SandboxPaneSlots
          activeTab={tabBarValue}
          panes={panes}
          preview={preview}
          owner={owner}
          sandboxId={sandboxId}
          isActive={isActive}
          repoId={repoId}
          cacheKey={taskIdStr}
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
  );
}
