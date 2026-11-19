"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { Id, SandboxOwner } from "@eva/backend";
import { isSessionSandboxTab, type SandboxTab } from "@/lib/search-params";
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
import { FilesPanel } from "@/routes/_repo/$owner/$repo/sessions/FilesPanel";
import { SandboxAgentsPanel } from "@/lib/components/sandbox/SandboxAgentsPanel";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { useSandboxAnnotationSend } from "@/lib/components/chat/sandboxChatBinding";
import { sandboxChatKeys } from "@/lib/components/chat/sandboxChatTurn";
import { useTaskChatBinding } from "./TaskSandboxChatPanel";
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
   * Resolved dev port for the current sandbox (the quick task session's
   * `devPort`, or a project task's own) — already accounts for any per-app
   * override on the repo.
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
  activeTab: SandboxTab;
  onTabChange: (tab: SandboxTab) => void;
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
  /** Lets the visible Preview float into the mini-player (Expand → returnTo). */
  miniPlayer: { returnTo: string; title: string } | undefined;
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
  activeTab,
  onTabChange,
  onStartSandbox,
  isSandboxStarting,
  autoWakeEligible,
  collapsed = false,
  onToggle,
  miniPlayer,
}: TaskSandboxPanelProps) {
  const simpleView = useSimpleView();
  const chatBinding = useTaskChatBinding(taskId);
  const submitAnnotation = useSandboxAnnotationSend(chatBinding);
  const chatKeys = sandboxChatKeys(chatBinding.entity);

  // Content-keyed Agents tab, folded from the chat transcript the task's chat
  // panel already subscribes to (same entity ids). Artifacts stay on the task:
  // the backend files a quick task's session artifacts under it.
  const artifactSource = { kind: "task" as const, taskId };
  const { artifactCount } = useSourceArtifacts(artifactSource);
  const { documentCount } = useSourceDocuments(artifactSource);
  const { agents, hasAgents, hasRunningAgents } = useSubagentRoster({
    parentId: chatKeys.parentId,
    streamingEntityId: chatKeys.streamingEntityId,
    backgroundAgents: chatBinding.doc?.backgroundAgents,
    sandboxRunning: isActive,
  });

  const viewState = useQuery(api.sandboxPanes.getViewState, { owner });
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);

  const preview = useSandboxPreview({
    owner,
    sandboxId,
    isActive,
    repoId,
    devPort,
  });

  const fileList = useSandboxFileList({ sandboxId, repoId, isActive });

  /* eslint-disable no-effect/no-event-handler --
     "prd" is a session-only tab that can arrive from a deep link or persisted
     state, so the redirect has to follow the prop rather than a click. */
  useEffect(() => {
    if (activeTab !== "prd") return;
    onTabChange("preview");
  }, [activeTab, onTabChange]);
  /* eslint-enable no-effect/no-event-handler */

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
        <div
          className={
            !simpleView && tabBarValue === "files" ? "h-full min-h-0" : "hidden"
          }
        >
          <FilesPanel
            sandboxId={sandboxId}
            repoId={repoId}
            isActive={isActive}
            fileList={fileList}
            wake={{ onStartSandbox, isSandboxStarting }}
          />
        </div>
        <div
          className={
            !simpleView && tabBarValue === "agents"
              ? "h-full min-h-0"
              : "hidden"
          }
        >
          <SandboxAgentsPanel entity={chatBinding.entity} agents={agents} />
        </div>
        <ReviewChatTargetProvider value={chatKeys.draftTarget ?? null}>
          <SandboxPaneSlots
            activeTab={tabBarValue}
            panes={panes}
            preview={preview}
            owner={owner}
            sandboxId={sandboxId}
            isActive={isActive}
            repoId={repoId}
            cacheKey={String(taskId)}
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
              miniPlayer !== undefined && !collapsed
                ? { ...miniPlayer, owner }
                : undefined
            }
            viewState={viewState}
          />
        </ReviewChatTargetProvider>
      </div>
    </SandboxPanelFrame>
  );
}
