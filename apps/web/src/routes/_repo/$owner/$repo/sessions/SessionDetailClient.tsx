import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useEffect, useRef, useState } from "react";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { useEntityDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { ChatPanel } from "./ChatPanel";
import { SandboxPanel } from "./SandboxPanel";
import { SessionDetailSkeleton } from "./_components/SessionDetailSkeleton";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { SandboxWorkspace } from "@/lib/components/sandbox/SandboxWorkspace";
import { SANDBOX_RAIL_WIDTH_PX } from "@/lib/components/sandbox/sandboxRail";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PendingReviewCommentsProvider } from "@/lib/contexts/PendingReviewCommentsContext";
import { isSessionPrReadOnly } from "./_utils/sessionReadOnly";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

export function SessionDetailClient({
  sessionId,
  activeSandboxTab,
  onSandboxTabChange,
  onOpenFile,
  onViewDiff,
  isRouteActive = true,
  hideTitle = false,
}: {
  sessionId: Id<"sessions">;
  /** Builtin tab id (SandboxTab) or a custom tab's name slug. */
  activeSandboxTab: string;
  onSandboxTabChange: (tab: string) => void;
  /** Opens a file (by full sandbox path) in the File Viewer tab. */
  onOpenFile: (path: string) => void;
  /** Opens the PR tab (Diffs sub-tab); optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /**
   * False while this session shell is kept mounted but another session is
   * shown — Preview must not clear/refetch from sibling URL churn.
   */
  isRouteActive?: boolean;
  /** Popover already titles the surface — omit the session-chat title. */
  hideTitle?: boolean;
}) {
  const { basePath, repo } = useRepo();
  // Hidden cached shells keep the last paint so switching back does not flash.
  // Skipping the hot streams — and the session doc itself — is what stops a
  // background turn from re-rendering a whole chat tree the user cannot see.
  const session = useHeldQuery(
    api.sessions.get,
    isRouteActive ? { id: sessionId } : "skip",
  );
  const messages = useHeldQuery(
    api.messages.listByParent,
    isRouteActive ? { parentId: sessionId } : "skip",
  );
  const queuedMessages = useHeldQuery(
    api.queuedMessages.listByParent,
    isRouteActive ? { parentId: sessionId } : "skip",
  );
  const streaming = useHeldQuery(
    api.streaming.get,
    isRouteActive ? { entityId: sessionId } : "skip",
  );
  const summaryStreaming = useHeldQuery(
    api.streaming.get,
    isRouteActive ? { entityId: `summary:${sessionId}` } : "skip",
  );
  const startupStreaming = useHeldQuery(
    api.streaming.get,
    isRouteActive ? { entityId: `session-startup-${sessionId}` } : "skip",
  );
  // Names the browser tab. Gated on `isRouteActive`: up to three session shells
  // stay mounted at once, and a hidden one must not title the tab.
  useEntityDocumentTitle(session?.title, isRouteActive);
  const startSandboxMutation = useMutation(api.sessions.startSandbox);
  const stopSandboxMutation = useMutation(api.sessions.stopSandbox);

  // Pre-warm the Claude daemon as soon as the session opens (once its sandbox is
  // known), so the user's first message is warm instead of paying a ~20s cold
  // respawn. Idempotent server-side (skips if a daemon is already alive), so
  // re-firing when the sandbox id resolves is cheap.
  const prewarmDaemon = useMutation(api.sessionWorkflow.prewarmDaemon);
  const sandboxId = session?.sandboxId;
  // A closed/stopping session keeps its sandboxId, so gate on status too:
  // prewarming resumes the stopped Vercel VM (server-side no-op now, but this
  // avoids the pointless round-trip on every closed-session page open).
  const sandboxStatus = session?.status;
  // Depend on the scalar fields only — depending on the `session` doc identity
  // re-fired this on every patch to the doc (status flips, updatedAt, PR
  // state…), and a burst of prewarms can race the server's alive-check into
  // launching duplicate daemons (observed in prod: 5 daemons on one session).
  const sessionPrState = session?.prState;
  useEffect(() => {
    // A hidden cached shell must not resume a VM the user is not looking at.
    if (!isRouteActive) return;
    if (!sandboxId) return;
    if (sandboxStatus === "closed" || sandboxStatus === "stopping") return;
    // Don't prewarm (which resumes the VM) when the PR is already terminal —
    // auto-stop below owns teardown for merged/closed sessions.
    if (isSessionPrReadOnly(sessionPrState)) return;
    void prewarmDaemon({ sessionId });
  }, [
    isRouteActive,
    sessionId,
    sandboxId,
    sandboxStatus,
    sessionPrState,
    prewarmDaemon,
  ]);

  // Recover sandboxes left running after a PR merge/close (webhook may have
  // only patched prState before auto-stop existed, or the stop raced).
  const prAutoStopKey = useRef<string | null>(null);
  useEffect(() => {
    if (session === null || session === undefined) return;
    if (!isSessionPrReadOnly(session.prState)) {
      prAutoStopKey.current = null;
      return;
    }
    if (session.status !== "active" && session.status !== "starting") {
      return;
    }
    const key = `${sessionId}:${session.prState}:${session.status}`;
    if (prAutoStopKey.current === key) return;
    prAutoStopKey.current = key;
    void stopSandboxMutation({ sessionId });
  }, [session, sessionId, stopSandboxMutation]);
  const isSandboxStarting = session?.status === "starting";
  // `stopping` is a transient backend state set synchronously by `stopSandbox`,
  // cleared once the Vercel sandbox's stop call completes. Showing the spinner
  // (and disabling Start) for its full duration prevents the stop/start race
  // that previously orphaned sandboxes.
  const isSandboxStopping = session?.status === "stopping";
  const [isStopPending, setIsStopPending] = useState(false);
  const simpleView = useSimpleView();
  // The Eva session drives other agents rather than editing its own checkout,
  // so it gets the chat with no sandbox panel (no preview / computer / review
  // tabs) — same tab-gating idea as simple view, one step further. This branch
  // is what makes the session renderable inline at `/eva`.
  const chatOnly = session?.isOrchestrator === true;
  const handleSandboxToggle = async (action: "start" | "stop") => {
    if (action === "start") {
      await catchMutationError(
        startSandboxMutation({ sessionId }),
        "Couldn't start sandbox",
        "session-sandbox-start",
      );
    } else {
      setIsStopPending(true);
      try {
        await catchMutationError(
          stopSandboxMutation({ sessionId }),
          "Couldn't stop sandbox",
          "session-sandbox-stop",
        );
      } catch {
        setIsStopPending(false);
        return;
      }
      setIsStopPending(false);
    }
  };

  // Auto-switch to Browser + expand sandbox panel on lock transition only
  // (undefined → set). Don't fight the user if they switch away mid-lock.
  // Skipped for chatOnly: there is no sandbox panel to switch, and the tab
  // change is a navigation — it would bounce Eva off its own `/eva` URL.
  const prevAgentBrowsingAt = useRef<number | undefined>(undefined);
  const [expandRightSignal, setExpandRightSignal] = useState(0);

  // Must stay above loading/null early returns — Phase 3 review comments
  // introduced this hook after them and tripped React #310 on session resolve.
  const handleViewDiff = (repoRelativePath?: string) => {
    if (simpleView || chatOnly) return;
    if (onViewDiff) {
      onViewDiff(repoRelativePath);
    } else {
      onSandboxTabChange("review");
    }
    setExpandRightSignal((n) => n + 1);
  };

  const agentBrowsingAt =
    session === null || session === undefined
      ? undefined
      : session.agentBrowsingAt;
  useEffect(() => {
    const prev = prevAgentBrowsingAt.current;
    prevAgentBrowsingAt.current = agentBrowsingAt;
    if (!isRouteActive || chatOnly) return;
    if (agentBrowsingAt === undefined || prev !== undefined) return;
    onSandboxTabChange("browser");
    setExpandRightSignal((n) => n + 1);
  }, [agentBrowsingAt, onSandboxTabChange, isRouteActive, chatOnly]);

  if (session === undefined) {
    return <SessionDetailSkeleton />;
  }

  if (session === null) {
    return (
      <EntityNotFound entityLabel="session" backTo={`${basePath}/sessions`} />
    );
  }

  const isSandboxActive = session.status === "active";
  const isArchived = session.archived === true;
  // Archive + PR terminal states share the same UI gates; PR reopen clears lock.
  const isReadOnly = isArchived || isSessionPrReadOnly(session.prState);

  const chatPanel = (sandboxCollapsed?: boolean) => (
    <ChatPanel
      sessionId={sessionId}
      title={session.title}
      branchName={session.branchName}
      prUrl={session.prUrl}
      prState={session.prState}
      summary={session.summary}
      messages={messages ?? []}
      queuedMessages={queuedMessages ?? []}
      planContent={session.planContent}
      streamingActivity={streaming?.currentActivity}
      streamingContent={streaming?.currentContent}
      streamingPendingQuestion={streaming?.pendingQuestion}
      summaryStreamingActivity={summaryStreaming?.currentActivity}
      startupStreamingActivity={startupStreaming?.currentActivity}
      isSandboxActive={isSandboxActive}
      isSandboxToggling={
        isSandboxStarting || isSandboxStopping || isStopPending
      }
      isSandboxStopping={isSandboxStopping || isStopPending}
      onSandboxToggle={handleSandboxToggle}
      isArchived={isArchived}
      isReadOnly={isReadOnly}
      deploymentStatus={session.deploymentStatus}
      sandboxCollapsed={sandboxCollapsed}
      // chatOnly mounts inline at the per-user `/orchestrator`, so the current
      // URL is not a link to *this* session — hand the header a real permalink.
      permalinkPath={
        chatOnly && session.numId !== undefined
          ? `${basePath}/sessions/${session.numId}`
          : undefined
      }
      chatOnly={chatOnly}
      hideTitle={hideTitle}
      isRouteActive={isRouteActive}
      onOpenFile={chatOnly ? undefined : onOpenFile}
      onViewDiff={chatOnly ? undefined : handleViewDiff}
      onOpenPrdTab={
        chatOnly
          ? undefined
          : () => {
              onSandboxTabChange("prd");
              setExpandRightSignal((n) => n + 1);
            }
      }
      onOpenAgentsTab={
        chatOnly
          ? undefined
          : () => {
              onSandboxTabChange("agents");
              setExpandRightSignal((n) => n + 1);
            }
      }
      backgroundAgents={session.backgroundAgents}
    />
  );

  if (chatOnly) {
    return (
      <PendingReviewCommentsProvider onOpenDiffsTab={handleViewDiff}>
        <div className="flex min-h-0 flex-1">{chatPanel()}</div>
      </PendingReviewCommentsProvider>
    );
  }

  return (
    <PendingReviewCommentsProvider onOpenDiffsTab={handleViewDiff}>
      <SandboxWorkspace
        ownerKind="session"
        ownerId={sessionId}
        storageScope={`session:${sessionId}`}
        sandboxId={session.sandboxId}
        isActive={isSandboxActive}
        terminalPanes={session.terminalPanes}
        hotkeyEnabled={isRouteActive}
      >
        {(panes, owner, terminalPanel) => (
          <ResizablePanelLayout
            leftPanel={({ rightPanelCollapsed }) =>
              chatPanel(rightPanelCollapsed)
            }
            rightPanel={({ rightPanelCollapsed, onToggleRightPanel }) => (
              <SandboxPanel
                sessionId={sessionId}
                sandboxId={session.sandboxId}
                isActive={isSandboxActive}
                isRouteActive={isRouteActive}
                repoId={session.repoId}
                prUrl={session.prUrl}
                // Prefer session (set after services start); fall back to app
                // settings so preview doesn't default to 3000 before that lands.
                devPort={session.devPort ?? repo.devPort}
                devCommand={session.devCommand ?? repo.devCommand}
                owner={owner}
                panes={panes}
                terminalPanel={terminalPanel}
                planContent={session.planContent}
                messages={messages ?? []}
                backgroundAgents={session.backgroundAgents}
                streamingActivity={streaming?.currentActivity}
                isArchived={isReadOnly}
                activeTab={activeSandboxTab}
                onTabChange={onSandboxTabChange}
                agentBrowsingAt={session.agentBrowsingAt}
                onStartSandbox={
                  isReadOnly || isSandboxStopping || isStopPending
                    ? undefined
                    : () => {
                        void handleSandboxToggle("start");
                      }
                }
                isSandboxStarting={isSandboxStarting}
                collapsed={rightPanelCollapsed}
                onToggle={onToggleRightPanel}
                miniPlayer={
                  session.numId !== undefined
                    ? {
                        returnTo: `${basePath}/sessions/${session.numId}/preview`,
                        title: session.title,
                      }
                    : undefined
                }
              />
            )}
            leftDefaultSize="40%"
            leftMinWidthPx={350}
            rightMinWidthPx={300}
            rightCollapsedSizePx={SANDBOX_RAIL_WIDTH_PX}
            storageKey="sandbox-collapsed"
            expandRightSignal={expandRightSignal}
            hotkeyEnabled={isRouteActive}
            mobilePaneLabels={{ left: "Chat", right: "Sandbox" }}
          />
        )}
      </SandboxWorkspace>
    </PendingReviewCommentsProvider>
  );
}
