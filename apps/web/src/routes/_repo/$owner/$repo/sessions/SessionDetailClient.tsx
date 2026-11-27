import { useMutation } from "convex/react";
import { CenteredSpinner } from "@vvedantb/ui";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { sandboxAutoWakeEligible } from "@eva/shared";
import { useEffect, useRef, useState } from "react";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { useEntityDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { ChatPanel } from "./ChatPanel";
import { SandboxPanel } from "./SandboxPanel";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { SandboxWorkspace } from "@/lib/components/sandbox/SandboxWorkspace";
import { useSandboxRailWidthPx } from "@/lib/components/sandbox/useSandboxRailLabels";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  useAgentBrowsingAutoSwitch,
  useSandboxControls,
} from "@/lib/components/sandbox/useSandboxLifecycle";

export function SessionDetailClient({
  sessionId,
  activeSandboxTab,
  onSandboxTabChange,
  onOpenFile,
  onViewDiff,
  isRouteActive = true,
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
}) {
  const { basePath, repo } = useRepo();
  const sandboxRailWidthPx = useSandboxRailWidthPx();
  // Hidden cached shells keep the last paint so switching back does not flash.
  // Skipping the hot streams — and the session doc itself — is what stops a
  // background turn from re-rendering a whole chat tree the user cannot see.
  const session = useHeldQuery(
    api.sessions.get,
    isRouteActive ? { id: sessionId } : "skip",
  );
  // The session's one chat (Main); null until a legacy session gets it.
  const activeChat = useHeldQuery(
    api.sessionChats.resolveForSession,
    isRouteActive ? { sessionId } : "skip",
    sessionId,
  );
  const chatId = activeChat?._id;
  // Names the browser tab. Gated on `isRouteActive`: up to three session shells
  // stay mounted at once, and a hidden one must not title the tab.
  useEntityDocumentTitle(session?.title, isRouteActive);
  const startSandboxMutation = useMutation(api.sessions.startSandbox);
  const stopSandboxMutation = useMutation(api.sessions.stopSandbox);
  const stopWorkSandbox = useMutation(api.sessions.stopWorkSandbox);
  const ensureMainChat = useMutation(api.sessionChats.ensureMain);

  // A session created before chats existed has no Main chat row yet; opening
  // it is what creates one (and moves its transcript onto it). Keyed on the
  // boolean so it fires once per empty result, not on every chat update.
  const needsMainChat = isRouteActive && activeChat === null;
  /* eslint-disable no-effect/no-event-handler --
     The missing Main chat is a server-side fact about a legacy session that
     only the live query reveals; there is no click to hang this on. */
  useEffect(() => {
    if (!needsMainChat) return;
    void ensureMainChat({ sessionId });
  }, [needsMainChat, sessionId, ensureMainChat]);
  /* eslint-enable no-effect/no-event-handler */

  // Pre-warm the active chat's daemon as soon as it is known (once the sandbox
  // is), so the user's first message is warm instead of paying a ~20s cold
  // respawn. Only the visible tab: idle daemons for every chat would hold
  // memory the running ones need. Idempotent server-side (skips if a daemon
  // is already alive), so re-firing when the sandbox id resolves is cheap.
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
  const sessionArchived = session?.archive !== undefined;
  /* eslint-disable no-effect/no-event-handler --
     Prewarms the sandbox daemon for the session the route landed on; the
     trigger is navigation plus server-side status, not a click. */
  useEffect(() => {
    // A hidden cached shell must not resume a VM the user is not looking at.
    if (!isRouteActive) return;
    if (!sandboxId || !chatId) return;
    if (sandboxStatus === "closed" || sandboxStatus === "stopping") return;
    // Don't prewarm (which resumes the VM) an archived session — auto-stop
    // below owns its teardown.
    if (sessionArchived) return;
    void prewarmDaemon({ chatId });
  }, [
    isRouteActive,
    chatId,
    sandboxId,
    sandboxStatus,
    sessionArchived,
    prewarmDaemon,
  ]);
  /* eslint-enable no-effect/no-event-handler */

  // Recover sandboxes left running in an archived session (the archive's own
  // stop may have raced). A merged PR the owner kept live (Disable
  // auto-archive) is not archived, so its sandbox stays up.
  const archiveAutoStopKey = useRef<string | null>(null);
  /* eslint-disable no-effect/no-event-handler --
     The auto-archive is a GitHub webhook landing in Convex, so the teardown has
     to follow the live query. The key ref keeps it to one call per state. */
  useEffect(() => {
    if (session === null || session === undefined) return;
    if (session.archive === undefined) {
      archiveAutoStopKey.current = null;
      return;
    }
    if (session.status !== "active" && session.status !== "starting") {
      return;
    }
    const key = `${sessionId}:${session.status}`;
    if (archiveAutoStopKey.current === key) return;
    archiveAutoStopKey.current = key;
    void stopSandboxMutation({ sessionId });
  }, [session, sessionId, stopSandboxMutation]);
  /* eslint-enable no-effect/no-event-handler */
  // `stopping` is a transient backend state set synchronously by `stopSandbox`,
  // cleared once the Vercel sandbox's stop call completes. Showing the spinner
  // (and disabling Start) for its full duration prevents the stop/start race
  // that previously orphaned sandboxes.
  const {
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    handleSandboxToggle,
  } = useSandboxControls({
    status: session?.status,
    owner: { kind: "session", sessionId },
    active: isRouteActive,
    start: () => startSandboxMutation({ sessionId }),
    stop: () => stopWorkSandbox({ target: { sessionId } }),
  });
  const simpleView = useSimpleView();

  const [expandRightSignal, setExpandRightSignal] = useState(0);

  // Must stay above loading/null early returns — Phase 3 review comments
  // introduced this hook after them and tripped React #310 on session resolve.
  const handleViewDiff = (repoRelativePath?: string) => {
    if (simpleView) return;
    if (onViewDiff) {
      onViewDiff(repoRelativePath);
    } else {
      onSandboxTabChange("review");
    }
    setExpandRightSignal((n) => n + 1);
  };
  // Declared here, not inline in the ChatPanel JSX: inline, the compiler
  // rebuilds it with that whole block, so it changes on every switch
  // (`isRouteActive`) and re-renders each transcript row it reaches.
  const openAgentsTab = () => {
    onSandboxTabChange("agents");
    setExpandRightSignal((n) => n + 1);
  };

  useAgentBrowsingAutoSwitch(
    session?.agentBrowsingAt,
    () => {
      onSandboxTabChange("browser");
      setExpandRightSignal((n) => n + 1);
    },
    isRouteActive,
  );

  if (session === undefined || activeChat === undefined) {
    return <CenteredSpinner label="Loading session" />;
  }

  if (session === null) {
    return (
      <EntityNotFound entityLabel="session" backTo={`${basePath}/sessions`} />
    );
  }

  // Main is being created by the effect above (legacy session on first open).
  if (activeChat === null) {
    return <CenteredSpinner label="Opening chat" />;
  }

  // `archive` is the one lock: a merged/closed PR locks the session only
  // through auto-archive, which the owner can turn off.
  const isArchived = session.archive !== undefined;

  const chatPanel = (
    <ChatPanel
      key={activeChat._id}
      session={session}
      chat={activeChat}
      sandboxStartupActivity={sandboxStartupActivity}
      isSandboxActive={isSandboxActive}
      isSandboxToggling={isSandboxStarting || isSandboxStopping}
      isSandboxStopping={isSandboxStopping}
      onSandboxToggle={handleSandboxToggle}
      isArchived={isArchived}
      isRouteActive={isRouteActive}
      onOpenFile={onOpenFile}
      onViewDiff={handleViewDiff}
      onOpenAgentsTab={openAgentsTab}
    />
  );

  return (
    <SandboxSurfaceProviders
      onOpenFile={onOpenFile}
      onOpenDiffsTab={handleViewDiff}
    >
      <SandboxWorkspace
        owner={{ kind: "session", sessionId }}
        storageScope={`session:${sessionId}`}
        sandboxId={session.sandboxId}
        isActive={isSandboxActive}
        terminalPanes={session.terminalPanes}
        hotkeyEnabled={isRouteActive}
      >
        {(panes, owner, terminalPanel) => (
          <ResizablePanelLayout
            chatPane="left"
            leftPanel={() => chatPanel}
            rightPanel={({ rightPanelCollapsed, onToggleRightPanel }) => (
              <SandboxPanel
                session={session}
                chat={activeChat}
                isActive={isSandboxActive}
                isRouteActive={isRouteActive}
                // Prefer session (set after services start); fall back to app
                // settings so preview doesn't default to 3000 before that lands.
                devPort={session.devPort ?? repo.devPort}
                devCommand={session.devCommand ?? repo.devCommand}
                owner={owner}
                panes={panes}
                terminalPanel={terminalPanel}
                isArchived={isArchived}
                activeTab={activeSandboxTab}
                onTabChange={onSandboxTabChange}
                onStartSandbox={
                  isArchived || isSandboxStopping
                    ? undefined
                    : () => {
                        void handleSandboxToggle("start");
                      }
                }
                isSandboxStarting={isSandboxStarting}
                autoWakeEligible={sandboxAutoWakeEligible({
                  status: session.status,
                  sandboxId: session.sandboxId,
                  sandboxError: session.sandboxError,
                  canStart: !isArchived,
                  // A session has no run that owns its sandbox.
                  isBusy: false,
                })}
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
            rightCollapsedSizePx={sandboxRailWidthPx}
            seamlessSeparator
            storageKey="sandbox-collapsed"
            collapsedStorageKey={`sandbox-collapsed:${sessionId}`}
            expandRightSignal={expandRightSignal}
            hotkeyEnabled={isRouteActive}
            mobilePaneLabels={{ left: "Chat", right: "Sandbox" }}
          />
        )}
      </SandboxWorkspace>
    </SandboxSurfaceProviders>
  );
}
