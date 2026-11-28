"use client";

import { useEffect } from "react";
import type { Id, SandboxOwner } from "@eva/backend";
import { isSessionSandboxTab, type SandboxTab } from "@/lib/search-params";
import { SandboxTabBar } from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabBar";
import { ReviewChatTargetProvider } from "@/lib/contexts/ReviewChatTargetContext";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { SandboxRailPanes } from "@/lib/components/sandbox/SandboxRailPanes";
import { type SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";
import { useSandboxFileList } from "@/lib/components/sandbox/useSandboxFileList";
import { useSandboxRail } from "@/lib/components/sandbox/useSandboxRail";
import { withBrowserTab } from "@/lib/components/sandbox/withBrowserTab";
import { SandboxPanelFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { FilesPanel } from "@/routes/_repo/$owner/$repo/sessions/FilesPanel";
import { useTaskChatBinding } from "./TaskSandboxChatPanel";
import { useSourceArtifacts } from "@/lib/components/artifacts/SessionArtifactsPanel";
import { useSourceDocuments } from "@/lib/components/docs/SessionDocumentsPanel";

interface TaskSandboxPanelProps {
  taskId: Id<"agentTasks">;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  devPort?: number;
  devCommand?: string;
  owner: SandboxOwner;
  panes: SandboxPanesApi;
  terminalPanel: TerminalPanelApi;
  prUrl?: string;
  activeTab: SandboxTab;
  onTabChange: (tab: SandboxTab) => void;
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  autoWakeEligible?: boolean;
  isArchived: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  miniPlayer: { returnTo: string; title: string } | undefined;
}

/**
 * Right-side sandbox panel for a quick task — mirrors the session sandbox
 * panel (Preview, Browser, Diffs, Files, Editor/Computer via +).
 * PRD stays session-only.
 *
 * The reads every rail shares are `useSandboxRail`; the shared tabs are
 * `SandboxRailPanes` and `SandboxPaneSlots`.
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
  isArchived,
  collapsed = false,
  onToggle,
  miniPlayer,
}: TaskSandboxPanelProps) {
  const chatBinding = useTaskChatBinding(taskId);
  const rail = useSandboxRail({
    owner,
    sandboxId,
    isActive,
    repoId,
    devPort,
    devCommand,
    binding: chatBinding,
  });

  const artifactSource = { kind: "task" as const, taskId };
  const { artifactCount } = useSourceArtifacts(artifactSource);
  const { documentCount } = useSourceDocuments(artifactSource);
  const { agents, hasAgents, hasRunningAgents } = rail.roster;

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
          agentBrowsingAt={rail.agentBrowsingAt}
          fileList={fileList}
          consoleDock={panes.consoleDock}
          terminalPanel={terminalPanel}
        />
      }
    >
      <div className="h-full overflow-hidden">
        <SandboxRailPanes
          activeTab={tabBarValue}
          artifactSource={artifactSource}
          files={
            <FilesPanel
              sandboxId={sandboxId}
              repoId={repoId}
              isActive={isActive}
              fileList={fileList}
              wake={{ onStartSandbox, isSandboxStarting }}
            />
          }
          agents={{
            entity: chatBinding.entity,
            list: agents,
            isReadOnly: isArchived,
          }}
        />
        <ReviewChatTargetProvider value={rail.reviewTarget}>
          <SandboxPaneSlots
            {...rail.paneSlots}
            activeTab={tabBarValue}
            panes={panes}
            cacheKey={String(taskId)}
            prUrl={prUrl}
            onStartSandbox={onStartSandbox}
            isSandboxStarting={isSandboxStarting}
            autoWakeEligible={autoWakeEligible}
            presenceEnabled={!collapsed}
            miniPlayer={
              miniPlayer !== undefined && !collapsed
                ? { ...miniPlayer, owner }
                : undefined
            }
          />
        </ReviewChatTargetProvider>
      </div>
    </SandboxPanelFrame>
  );
}
