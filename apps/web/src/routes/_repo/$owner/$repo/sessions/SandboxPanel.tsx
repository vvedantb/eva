import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  api,
  type BackgroundAgentEntry,
  type Id,
  type SandboxOwner,
} from "@eva/backend";
import { isSessionSandboxTab } from "@/lib/search-params";
import { slugifyAppTabName } from "@/lib/utils/appTabSlug";
import { IconClipboardList } from "@tabler/icons-react";
import { SandboxTabBar } from "./_components/SandboxTabBar";
import { SandboxAgentsPanel } from "@/lib/components/sandbox/SandboxAgentsPanel";
import { SessionPrdPlanView } from "./_components/SessionPrdPlanView";
import { DesignVariationsPanel } from "./_components/DesignVariationsPanel";
import { FilesPanel } from "./FilesPanel";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { type SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";
import { useSandboxPreview } from "@/lib/components/sandbox/useSandboxPreview";
import { useComputerTab } from "@/lib/components/sandbox/useComputerTab";
import { useEditorTab } from "@/lib/components/sandbox/useEditorTab";
import { useSandboxFileList } from "@/lib/components/sandbox/useSandboxFileList";
import { withBrowserTab } from "@/lib/components/sandbox/withBrowserTab";
import {
  deriveSubagents,
  subagentTone,
} from "@/lib/components/sandbox/agentActivity";
import { SandboxPanelFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { useSeedChatDraft } from "@/lib/components/chat/useSeedChatDraft";
import { useSessionAnnotationSend } from "./_components/useSessionAnnotationSend";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  getLatestVariations,
  type SessionDesignMessage,
} from "./_utils/designVariations";
import { isAssistantTurnInProgress } from "@/lib/components/chat/chatBodyUtils";
import {
  APPROVE_PLAN_PROMPT,
  designVariationPrompt,
} from "./_utils/composerPrompts";
interface SandboxPanelProps {
  sessionId: Id<"sessions">;
  /** The active chat tab; annotations and agent stops route to it. */
  chatId: Id<"sessionChats">;
  sandboxId: string | undefined;
  isActive: boolean;
  /**
   * False while another session is shown but this shell stays mounted.
   * Preview freezes instead of clearing on shared URL search churn.
   */
  isRouteActive?: boolean;
  repoId: Id<"githubRepos">;
  prUrl?: string;
  devPort?: number;
  devCommand?: string;
  owner: SandboxOwner;
  panes: SandboxPanesApi;
  terminalPanel: TerminalPanelApi;
  planContent?: string;
  messages?: SessionDesignMessage[];
  /** Sub-agent lifecycle entries from the session doc (Agents tab). */
  backgroundAgents?: BackgroundAgentEntry[];
  /** Live activity payload for the current turn (Agents tab live steps). */
  streamingActivity?: string;
  isArchived?: boolean;
  /** Builtin tab id (SandboxTab) or a custom tab's name slug. */
  activeTab: string;
  onTabChange: (tab: string) => void;
  agentBrowsingAt?: number;
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}
export function SandboxPanel({
  sessionId,
  chatId,
  sandboxId,
  isActive,
  isRouteActive = true,
  repoId,
  prUrl,
  devPort,
  devCommand,
  owner,
  panes,
  terminalPanel,
  planContent,
  messages = [],
  backgroundAgents,
  streamingActivity,
  isArchived,
  activeTab,
  onTabChange,
  agentBrowsingAt,
  onStartSandbox,
  isSandboxStarting,
  collapsed = false,
  onToggle,
}: SandboxPanelProps) {
  const simpleView = useSimpleView();
  const sessionIdStr = String(sessionId);
  const submitAnnotation = useSessionAnnotationSend(sessionId, chatId);
  const seedChatDraft = useSeedChatDraft({
    kind: "sessionChat",
    sessionId,
    chatId,
  });
  const latestVariations = getLatestVariations(messages);
  // Both tabs are content-keyed: they appear once the session has produced the
  // artefact they show, whatever prompt or skill produced it.
  const hasPlanContent =
    typeof planContent === "string" && planContent.trim().length > 0;
  const hasDesignsContent = latestVariations.length > 0;
  const isDesignExecuting = isAssistantTurnInProgress(messages);
  // Streaming payloads can outlive their turn; only fold them in while one runs.
  const agents = deriveSubagents({
    activityLogs: messages.map((m) => m.activityLog),
    streamingActivity: isDesignExecuting ? streamingActivity : undefined,
    backgroundAgents,
    sandboxRunning: isActive,
  });
  const hasAgents = agents.length > 0;
  const hasRunningAgents = agents.some(
    (agent) => subagentTone(agent.status) === "active",
  );
  // Sticky Preview path/port + console tail, keyed by the sandbox owner so all
  // three surfaces read and write this state through the same functions.
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
    isRouteActive,
    repoId,
    devPort,
    onPortPersist: (port) => {
      void setPreviewPort({ owner, port });
    },
  });
  const fileList = useSandboxFileList({ sandboxId, repoId, isActive });
  const {
    computerTabOpen,
    computerRunning,
    setComputerRunning,
    openComputer,
    closeComputer,
  } = useComputerTab(`session:${sessionIdStr}`, activeTab, onTabChange);
  const { editorTabOpen, openEditor, closeEditor } = useEditorTab(
    `session:${sessionIdStr}`,
    activeTab,
    onTabChange,
  );
  // User-defined tabs for this app, in display order, enabled only.
  const allCustomTabs = useQuery(api.appTabs.list, { repoId });
  const customTabs = (allCustomTabs ?? []).filter((tab) => tab.enabled);
  // If the URL points at a custom tab that no longer exists (deleted / disabled /
  // renamed), fall back to preview. Wait for the query to load before deciding.
  useEffect(() => {
    if (activeTab === "terminal") {
      onTabChange("preview");
      return;
    }
    if (isSessionSandboxTab(activeTab)) return;
    if (allCustomTabs === undefined) return;
    if (!customTabs.some((tab) => slugifyAppTabName(tab.name) === activeTab)) {
      onTabChange("preview");
    }
  }, [activeTab, allCustomTabs, customTabs, onTabChange]);
  const enabledTabs = withBrowserTab(panes.enabledTabs);
  const previewUrl = preview.previewInfo?.url ?? null;
  return (
    <SandboxPanelFrame
      collapsed={collapsed}
      tabBar={
        <SandboxTabBar
          className="px-2 py-2 sm:px-3 sm:py-3"
          activeTab={activeTab}
          onTabChange={onTabChange}
          collapsed={collapsed}
          onToggle={onToggle}
        onNewPreview={() => {
          panes.handleNewPreview();
          onTabChange("preview");
        }}
        newPreviewDisabled={panes.newPreviewDisabled}
        enabledTabs={enabledTabs}
        showPrdTab={hasPlanContent}
        hasPrdContent={hasPlanContent}
        showDesignsTab={hasDesignsContent}
        hasDesignsContent={hasDesignsContent}
        showFilesTab
        showAgentsTab={hasAgents}
        hasRunningAgents={hasRunningAgents}
        customTabs={simpleView ? undefined : customTabs}
        agentBrowsingAt={agentBrowsingAt}
        computerTabOpen={computerTabOpen}
        computerRunning={computerRunning}
        onOpenComputer={openComputer}
        onCloseComputer={closeComputer}
        editorTabOpen={editorTabOpen}
        onOpenEditor={openEditor}
        onCloseEditor={closeEditor}
        hotkeysEnabled={isRouteActive}
        fileList={fileList}
        consoleDock={panes.consoleDock}
        terminalPanel={terminalPanel}
        />
      }
    >
      <div className="h-full overflow-hidden">
        <div
          className={
            activeTab === "prd"
              ? "flex h-full min-h-0 flex-col overflow-hidden"
              : "hidden"
          }
        >
          {planContent ? (
            <SessionPrdPlanView
              sessionId={sessionId}
              planContent={planContent}
              onApprovePlan={() => {
                void seedChatDraft(APPROVE_PLAN_PROMPT);
              }}
              variant="panel"
              isArchived={isArchived}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <IconClipboardList className="h-10 w-10 text-muted-foreground/60" />
              <div className="max-w-md space-y-1">
                <p className="text-sm font-medium">No plan yet</p>
                <p className="text-sm text-muted-foreground">
                  Run <span className="font-mono">/eva-plan</span> in the
                  composer and describe what you want to build — the plan will
                  appear here once generated.
                </p>
              </div>
            </div>
          )}
        </div>
        <div
          className={
            activeTab === "designs"
              ? "flex h-full min-h-0 flex-col overflow-hidden"
              : "hidden"
          }
        >
          <DesignVariationsPanel
            previewUrl={previewUrl}
            sandboxRunning={isActive}
            isArchived={isArchived === true}
            isExecuting={isDesignExecuting}
            latestVariations={latestVariations}
            isSandboxStarting={isSandboxStarting === true}
            onStartSandbox={() => onStartSandbox?.()}
            onUseVariation={(letter, label) => {
              void seedChatDraft(designVariationPrompt(letter, label));
            }}
          />
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
          <SandboxAgentsPanel
            entity={{ kind: "session", sessionId, chatId }}
            agents={agents}
            isReadOnly={isArchived === true}
          />
        </div>
        <SandboxPaneSlots
          activeTab={activeTab}
          panes={panes}
          preview={preview}
          owner={owner}
          sandboxId={sandboxId}
          isActive={isActive}
          repoId={repoId}
          cacheKey={sessionIdStr}
          devCommand={devCommand}
          prUrl={prUrl}
          customTabs={simpleView ? undefined : customTabs}
          agentBrowsingAt={agentBrowsingAt}
          onReleaseBrowserLock={() =>
            void catchMutationError(
              releaseBrowserLock({ owner }),
              "Couldn't unlock browser",
              "sandbox-browser-unlock",
            )
          }
          // Backend starts the app in the Console tmux session after startup.
          runConsoleDevCommandOnConnect={false}
          onComputerRunningChange={setComputerRunning}
          onStartSandbox={onStartSandbox}
          isSandboxStarting={isSandboxStarting}
          onAnnotationSubmit={submitAnnotation}
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
