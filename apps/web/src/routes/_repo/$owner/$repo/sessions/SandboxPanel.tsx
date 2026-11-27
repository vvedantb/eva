import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useQueryState } from "nuqs";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import {
  api,
  type BackgroundAgentEntry,
  type Id,
  type SandboxOwner,
} from "@eva/backend";
import {
  filesRootParser,
  isSessionSandboxTab,
  sandboxTabIdFromParam,
} from "@/lib/search-params";
import { slugifyAppTabName } from "@eva/shared/appTabSlug";
import { IconClipboardList } from "@tabler/icons-react";
import { SandboxTabBar } from "./_components/SandboxTabBar";
import { SandboxAgentsPanel } from "@/lib/components/sandbox/SandboxAgentsPanel";
import { ProposedPlanCard } from "./_components/ProposedPlanCard";
import { useSessionPlanImplementation } from "./_components/useSessionPlanImplementation";
import { useSessionPlanDocument } from "./_components/useSessionPlanDocument";
import type { ProposedPlanRow } from "@eva/shared/proposedPlan";
import { DesignVariationsPanel } from "./_components/DesignVariationsPanel";
import {
  SessionArtifactsPanel,
  useSourceArtifacts,
} from "@/lib/components/artifacts/SessionArtifactsPanel";
import {
  SessionDocumentsPanel,
  useSourceDocuments,
} from "@/lib/components/docs/SessionDocumentsPanel";
import { FilesPanel } from "./FilesPanel";
import { KeepAlivePane } from "@/lib/components/sandbox/KeepAlivePane";
import { ReviewChatTargetProvider } from "@/lib/contexts/ReviewChatTargetContext";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { type SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";
import { DEFAULT_PREVIEW_PORT } from "@eva/shared";
import { useSandboxPreview } from "@/lib/components/sandbox/useSandboxPreview";
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
import { isChatTurnExecuting } from "@/lib/components/chat/chatBodyUtils";
import { previewPortOptions } from "./_utils";
import { designVariationPrompt } from "./_utils/composerPrompts";

interface SandboxPanelProps {
  sessionId: Id<"sessions">;
  chatId: Id<"sessionChats">;
  sandboxId: string | undefined;
  isActive: boolean;
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
  backgroundAgents?: BackgroundAgentEntry[];
  streamingActivity?: string;
  isArchived?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  agentBrowsingAt?: number;
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  autoWakeEligible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  miniPlayer: { returnTo: string; title: string } | undefined;
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
  autoWakeEligible,
  collapsed = false,
  onToggle,
  miniPlayer,
}: SandboxPanelProps) {
  const simpleView = useSimpleView();
  const sessionIdStr = String(sessionId);
  const submitAnnotation = useSessionAnnotationSend(
    sessionId,
    chatId,
    isRouteActive,
  );
  const seedChatDraft = useSeedChatDraft({
    kind: "sessionChat",
    sessionId,
    chatId,
  });
  const proposedPlans = useHeldQuery(
    api.proposedPlans.listBySession,
    isRouteActive ? { sessionId } : "skip",
  );
  const { implementPlan, implementPlanContent, implementInNewSession } =
    useSessionPlanImplementation({
      sessionId,
      chatId,
      handleSend: (content) => {
        void seedChatDraft(content);
      },
      isRouteActive,
    });
  const {
    savePlan,
    saveAsDocument,
    saveAsDocumentLabel,
    isSaving,
    isSavingDoc,
  } = useSessionPlanDocument(sessionId);
  const latestVariations = getLatestVariations(messages);
  const hasPlanContent =
    typeof planContent === "string" && planContent.trim().length > 0;
  const capturedPlan = hasPlanContent
    ? matchingProposedPlan(proposedPlans ?? [], planContent ?? "")
    : null;
  const planImplemented = capturedPlan?.implementedAt !== undefined;
  const hasDesignsContent = latestVariations.length > 0;
  const artifactSource = { kind: "session" as const, sessionId };
  const { artifactCount } = useSourceArtifacts(artifactSource);
  const { documentCount } = useSourceDocuments(artifactSource);
  const turnStatus = useHeldQuery(
    api.turns.getChatStatus,
    isRouteActive ? { entityId: chatId } : "skip",
  );
  const isDesignExecuting = isChatTurnExecuting({
    status: turnStatus,
    messages,
  });
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
  const viewState = useHeldQuery(
    api.sandboxPanes.getViewState,
    isRouteActive ? { owner } : "skip",
  );
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);
  const preview = useSandboxPreview({
    owner,
    sandboxId,
    isActive,
    isRouteActive,
    repoId,
    devPort,
  });
  const [filesRoot, setFilesRoot] = useQueryState("filesRoot", filesRootParser);
  const sessionRepos = useHeldQuery(api.sessions.listRepos, { sessionId });
  const fileList = useSandboxFileList({
    sandboxId,
    repoId,
    isActive,
    rootPath: filesRoot || undefined,
  });
  const allCustomTabs = useHeldQuery(
    api.appTabs.list,
    isRouteActive ? { repoId } : "skip",
  );
  const customTabs = (allCustomTabs ?? []).filter((tab) => tab.enabled);
  useEffect(() => {
    const tabId = sandboxTabIdFromParam(activeTab);
    if (tabId === "terminal") {
      onTabChange("preview");
      return;
    }
    if (isSessionSandboxTab(tabId)) return;
    if (allCustomTabs === undefined) return;
    if (!customTabs.some((tab) => slugifyAppTabName(tab.name) === tabId)) {
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
          artifactCount={artifactCount}
          documentCount={documentCount}
          showFilesTab
          showAgentsTab={hasAgents}
          hasRunningAgents={hasRunningAgents}
          customTabs={simpleView ? undefined : customTabs}
          agentBrowsingAt={agentBrowsingAt}
          hotkeysEnabled={isRouteActive}
          fileList={fileList}
          consoleDock={panes.consoleDock}
          terminalPanel={terminalPanel}
        />
      }
    >
      <div className="h-full overflow-hidden">
        <KeepAlivePane
          active={activeTab === "prd"}
          className="flex h-full min-h-0 flex-col overflow-hidden"
        >
          {planContent ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <ProposedPlanCard
                planMarkdown={planContent}
                implemented={planImplemented}
                onImplement={
                  isArchived || planImplemented
                    ? undefined
                    : () => {
                        if (capturedPlan) {
                          implementPlan(capturedPlan);
                          return;
                        }
                        implementPlanContent(planContent);
                      }
                }
                onImplementInNewSession={
                  isArchived || planImplemented
                    ? undefined
                    : () =>
                        void implementInNewSession(
                          planContent,
                          capturedPlan ?? undefined,
                        )
                }
                onSave={isArchived ? undefined : savePlan}
                onSaveAsDocument={isArchived ? undefined : saveAsDocument}
                saveAsDocumentLabel={saveAsDocumentLabel}
                isSaving={isSaving}
                isSavingDoc={isSavingDoc}
                isArchived={isArchived}
              />
            </div>
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
        </KeepAlivePane>
        <KeepAlivePane
          active={activeTab === "designs"}
          className="flex h-full min-h-0 flex-col overflow-hidden"
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
        </KeepAlivePane>
        <KeepAlivePane
          active={activeTab === "artifacts"}
          className="flex h-full min-h-0 flex-col overflow-hidden"
        >
          <SessionArtifactsPanel source={artifactSource} />
        </KeepAlivePane>
        <KeepAlivePane
          active={activeTab === "documents"}
          className="flex h-full min-h-0 flex-col overflow-hidden"
        >
          <SessionDocumentsPanel source={artifactSource} />
        </KeepAlivePane>
        <KeepAlivePane
          active={!simpleView && activeTab === "files"}
          className="h-full min-h-0"
        >
          <FilesPanel
            sandboxId={sandboxId}
            repoId={repoId}
            isActive={isActive}
            fileList={fileList}
            wake={{ onStartSandbox, isSandboxStarting }}
            repos={sessionRepos}
            activeRoot={filesRoot}
            onRootChange={setFilesRoot}
          />
        </KeepAlivePane>
        <KeepAlivePane
          active={!simpleView && activeTab === "agents"}
          className="h-full min-h-0"
        >
          <SandboxAgentsPanel
            entity={{ kind: "session", sessionId, chatId }}
            agents={agents}
            isReadOnly={isArchived === true}
          />
        </KeepAlivePane>
        <ReviewChatTargetProvider
          value={{ kind: "sessionChat", sessionId, chatId }}
        >
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
            runConsoleDevCommandOnConnect={false}
            onStartSandbox={onStartSandbox}
            isSandboxStarting={isSandboxStarting}
            onAnnotationSubmit={submitAnnotation}
            // Only the session on screen holds the idle-pause presence beacon;
            // cached siblings and a collapsed rail must not keep a VM awake.
            presenceEnabled={isRouteActive && !collapsed}
            onScreen={isRouteActive}
            autoWakeEligible={autoWakeEligible}
            previewPortOptions={previewPortOptions(
              sessionRepos,
              devPort ?? DEFAULT_PREVIEW_PORT,
            )}
            miniPlayer={
              miniPlayer !== undefined && isRouteActive && !collapsed
                ? { ...miniPlayer, owner: { kind: "session", sessionId } }
                : undefined
            }
            viewState={viewState}
          />
        </ReviewChatTargetProvider>
      </div>
    </SandboxPanelFrame>
  );
}

function matchingProposedPlan(
  proposedPlans: ReadonlyArray<ProposedPlanRow>,
  planContent: string,
): ProposedPlanRow | null {
  const trimmed = planContent.trim();
  return (
    proposedPlans.find((plan) => plan.planMarkdown.trim() === trimmed) ?? null
  );
}
