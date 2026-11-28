import { useEffect } from "react";
import { useQueryState } from "nuqs";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { api, type Doc, type SandboxOwner } from "@eva/backend";
import {
  filesRootParser,
  isSessionSandboxTab,
  sandboxTabIdFromParam,
} from "@/lib/search-params";
import { slugifyAppTabName } from "@eva/shared/appTabSlug";
import { IconClipboardList } from "@tabler/icons-react";
import { SandboxTabBar } from "./_components/SandboxTabBar";
import { ProposedPlanCard } from "./_components/ProposedPlanCard";
import { useSessionPlanImplementation } from "./_components/useSessionPlanImplementation";
import { useSessionPlanDocument } from "./_components/useSessionPlanDocument";
import { useSessionChatBinding } from "./_components/useSessionChatBinding";
import type { ProposedPlanRow } from "@eva/shared/proposedPlan";
import { DesignVariationsPanel } from "./_components/DesignVariationsPanel";
import { useSourceArtifacts } from "@/lib/components/artifacts/SessionArtifactsPanel";
import { useSourceDocuments } from "@/lib/components/docs/SessionDocumentsPanel";
import { FilesPanel } from "./FilesPanel";
import { KeepAlivePane } from "@/lib/components/sandbox/KeepAlivePane";
import { ReviewChatTargetProvider } from "@/lib/contexts/ReviewChatTargetContext";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { SandboxRailPanes } from "@/lib/components/sandbox/SandboxRailPanes";
import { type SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";
import { DEFAULT_PREVIEW_PORT } from "@eva/shared";
import { useSandboxFileList } from "@/lib/components/sandbox/useSandboxFileList";
import { useSandboxRail } from "@/lib/components/sandbox/useSandboxRail";
import { withBrowserTab } from "@/lib/components/sandbox/withBrowserTab";
import { SandboxPanelFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { useSandboxChatTranscript } from "@/lib/components/chat/sandboxChatBinding";
import { useSeedChatDraft } from "@/lib/components/chat/useSeedChatDraft";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { getLatestVariations } from "./_utils/designVariations";
import { previewPortOptions } from "./_utils";
import { designVariationPrompt } from "./_utils/composerPrompts";

interface SandboxPanelProps {
  session: Doc<"sessions">;
  chat: Doc<"sessionChats">;
  isActive: boolean;
  isRouteActive: boolean;
  devPort?: number;
  devCommand?: string;
  owner: SandboxOwner;
  panes: SandboxPanesApi;
  terminalPanel: TerminalPanelApi;
  isArchived: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
  autoWakeEligible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  miniPlayer: { returnTo: string; title: string } | undefined;
}
export function SandboxPanel({
  session,
  chat,
  isActive,
  isRouteActive,
  devPort,
  devCommand,
  owner,
  panes,
  terminalPanel,
  isArchived,
  activeTab,
  onTabChange,
  onStartSandbox,
  isSandboxStarting,
  autoWakeEligible,
  collapsed = false,
  onToggle,
  miniPlayer,
}: SandboxPanelProps) {
  const simpleView = useSimpleView();
  const sessionId = session._id;
  const { sandboxId, repoId, planContent } = session;
  const binding = useSessionChatBinding({ session, chat, isRouteActive });
  const rail = useSandboxRail({
    owner,
    sandboxId,
    isActive,
    repoId,
    devPort,
    devCommand,
    binding,
    active: isRouteActive,
  });
  const seedChatDraft = useSeedChatDraft({
    kind: "sessionChat",
    sessionId,
    chatId: chat._id,
  });
  const seedDraft = (content: string) => {
    void seedChatDraft(content);
  };
  const proposedPlans = useHeldQuery(
    api.proposedPlans.listBySession,
    isRouteActive ? { sessionId } : "skip",
  );
  const { implementPlan, implementPlanContent, implementInNewSession } =
    useSessionPlanImplementation(binding);
  const {
    savePlan,
    saveAsDocument,
    saveAsDocumentLabel,
    isSaving,
    isSavingDoc,
  } = useSessionPlanDocument(sessionId);
  const { messages, isExecuting: isDesignExecuting } =
    useSandboxChatTranscript(binding);
  const latestVariations = getLatestVariations(messages ?? []);
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
  const { agents, hasAgents, hasRunningAgents } = rail.roster;
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
  const previewUrl = rail.preview.previewInfo?.url ?? null;
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
          agentBrowsingAt={rail.agentBrowsingAt}
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
                          implementPlan(capturedPlan, seedDraft);
                          return;
                        }
                        implementPlanContent(planContent, seedDraft);
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
            isArchived={isArchived}
            isExecuting={isDesignExecuting}
            latestVariations={latestVariations}
            isSandboxStarting={isSandboxStarting === true}
            onStartSandbox={() => onStartSandbox?.()}
            onUseVariation={(letter, label) => {
              void seedChatDraft(designVariationPrompt(letter, label));
            }}
          />
        </KeepAlivePane>
        <SandboxRailPanes
          activeTab={activeTab}
          artifactSource={artifactSource}
          files={
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
          }
          agents={{
            entity: binding.entity,
            list: agents,
            isReadOnly: isArchived,
          }}
        />
        <ReviewChatTargetProvider value={rail.reviewTarget}>
          <SandboxPaneSlots
            {...rail.paneSlots}
            activeTab={activeTab}
            panes={panes}
            cacheKey={String(sessionId)}
            prUrl={session.prUrl}
            customTabs={simpleView ? undefined : customTabs}
            onStartSandbox={onStartSandbox}
            isSandboxStarting={isSandboxStarting}
            presenceEnabled={isRouteActive && !collapsed}
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
