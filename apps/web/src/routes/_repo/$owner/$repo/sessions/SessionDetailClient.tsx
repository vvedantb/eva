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
  activeSandboxTab: string;
  onSandboxTabChange: (tab: string) => void;
  onOpenFile: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  isRouteActive?: boolean;
}) {
  const { basePath, repo } = useRepo();
  const sandboxRailWidthPx = useSandboxRailWidthPx();
  const session = useHeldQuery(
    api.sessions.get,
    isRouteActive ? { id: sessionId } : "skip",
  );
  const activeChat = useHeldQuery(
    api.sessionChats.resolveForSession,
    isRouteActive ? { sessionId } : "skip",
    sessionId,
  );
  const chatId = activeChat?._id;
  useEntityDocumentTitle(session?.title, isRouteActive);
  const startSandboxMutation = useMutation(api.sessions.startSandbox);
  const stopSandboxMutation = useMutation(api.sessions.stopSandbox);
  const stopWorkSandbox = useMutation(api.sessions.stopWorkSandbox);
  const ensureMainChat = useMutation(api.sessionChats.ensureMain);

  const needsMainChat = isRouteActive && activeChat === null;
  /* eslint-disable no-effect/no-event-handler --
     The missing Main chat is a server-side fact about a legacy session that
     only the live query reveals; there is no click to hang this on. */
  useEffect(() => {
    if (!needsMainChat) return;
    void ensureMainChat({ sessionId });
  }, [needsMainChat, sessionId, ensureMainChat]);
  /* eslint-enable no-effect/no-event-handler */

  const prewarmDaemon = useMutation(api.sessionWorkflow.prewarmDaemon);
  const sandboxId = session?.sandboxId;
  const sandboxStatus = session?.status;
  const sessionArchived = session?.archive !== undefined;
  /* eslint-disable no-effect/no-event-handler --
     Prewarms the sandbox daemon for the session the route landed on; the
     trigger is navigation plus server-side status, not a click. */
  useEffect(() => {
    if (!isRouteActive) return;
    if (!sandboxId || !chatId) return;
    if (sandboxStatus === "closed" || sandboxStatus === "stopping") return;
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

  const handleViewDiff = (repoRelativePath?: string) => {
    if (simpleView) return;
    if (onViewDiff) {
      onViewDiff(repoRelativePath);
    } else {
      onSandboxTabChange("review");
    }
    setExpandRightSignal((n) => n + 1);
  };
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

  if (activeChat === null) {
    return <CenteredSpinner label="Opening chat" />;
  }

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
