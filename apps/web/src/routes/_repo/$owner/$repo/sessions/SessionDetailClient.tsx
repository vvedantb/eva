import { useMutation } from "convex/react";
import { CenteredSpinner } from "@vvedantb/ui";
import { api } from "@eva/backend";
import type { Doc, Id } from "@eva/backend";
import { chatStreamingEntityId, sandboxStartupEntityId } from "@eva/shared";
import { useEffect, useRef, useState } from "react";
import { useChatTranscript } from "@/lib/hooks/useChatTranscript";
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
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  useAgentBrowsingAutoSwitch,
  useSandboxLifecycle,
} from "@/lib/components/sandbox/useSandboxLifecycle";

export function SessionDetailClient({
  sessionId,
  chatNumber,
  onChatChange,
  activeSandboxTab,
  onSandboxTabChange,
  onOpenFile,
  onViewDiff,
  isRouteActive = true,
}: {
  sessionId: Id<"sessions">;
  chatNumber: number | null;
  onChatChange: (number: number | null) => void;
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
  const chats = useHeldQuery(
    api.sessionChats.listForSession,
    isRouteActive ? { sessionId } : "skip",
  );
  const activeChat = useHeldQuery(
    api.sessionChats.resolveForSession,
    isRouteActive
      ? { sessionId, ...(chatNumber !== null ? { number: chatNumber } : {}) }
      : "skip",
    sessionId,
  );
  const chatStatuses = useHeldQuery(
    api.turns.listSessionChatStatuses,
    isRouteActive ? { sessionId } : "skip",
  );
  const chatId = activeChat?._id;
  const messages = useChatTranscript(isRouteActive && chatId ? chatId : "skip");
  const queuedMessages = useHeldQuery(
    api.queuedMessages.listByParent,
    isRouteActive && chatId ? { parentId: chatId } : "skip",
  );
  const streaming = useHeldQuery(
    api.streaming.get,
    isRouteActive && chatId
      ? { entityId: chatStreamingEntityId(chatId) }
      : "skip",
  );
  const startupStreaming = useHeldQuery(
    api.streaming.get,
    isRouteActive
      ? { entityId: sandboxStartupEntityId({ kind: "session", sessionId }) }
      : "skip",
  );
  useEntityDocumentTitle(session?.title, isRouteActive);
  const startSandboxMutation = useMutation(api.sessions.startSandbox);
  const stopSandboxMutation = useMutation(api.sessions.stopSandbox);
  const stopWorkSandbox = useMutation(api.sessions.stopWorkSandbox);
  const ensureMainChat = useMutation(api.sessionChats.ensureMain);
  const createChat = useMutation(api.sessionChats.create);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const needsMainChat =
    isRouteActive && chats !== undefined && chats.length === 0;
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
  const lifecycle = useSandboxLifecycle(session?.status);
  const isSandboxStarting = lifecycle.isStarting;
  const isSandboxStopping = lifecycle.isStopping;
  const simpleView = useSimpleView();
  const handleSandboxToggle = (action: "start" | "stop") =>
    lifecycle.run(action, async () => {
      await (
        action === "start"
          ? catchMutationError(
              startSandboxMutation({ sessionId }),
              "Couldn't start sandbox",
              "session-sandbox-start",
            )
          : catchMutationError(
              stopWorkSandbox({ target: { sessionId } }),
              "Couldn't stop sandbox",
              "session-sandbox-stop",
            )
      ).catch(() => undefined);
    });

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
  const openPrdTab = () => {
    onSandboxTabChange("prd");
    setExpandRightSignal((n) => n + 1);
  };
  const openAgentsTab = () => {
    onSandboxTabChange("agents");
    setExpandRightSignal((n) => n + 1);
  };

  const handleCreateChat = async () => {
    if (isCreatingChat) return;
    setIsCreatingChat(true);
    const createArgs = { sessionId, ...(chatId ? { fromChatId: chatId } : {}) };
    try {
      const created = await withMutationToast(
        createChat(createArgs),
        "New chat opened",
        "Couldn't open a new chat",
        "session-chat-create",
      );
      onChatChange(created.number);
    } catch {
      setIsCreatingChat(false);
      return;
    }
    setIsCreatingChat(false);
  };

  const handleSelectChat = (chat: Doc<"sessionChats">) => {
    onChatChange(chat.number);
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

  const isSandboxActive = session.status === "active";
  const isArchived = session.archive !== undefined;

  const chatPanel = (
    <ChatPanel
      key={activeChat._id}
      sessionId={sessionId}
      session={session}
      chat={activeChat}
      chats={chats ?? []}
      chatStatuses={chatStatuses ?? []}
      onSelectChat={handleSelectChat}
      onCreateChat={() => void handleCreateChat()}
      isCreatingChat={isCreatingChat}
      title={session.title}
      branchName={session.branchName}
      sandboxBranch={session.sandboxBranch}
      sandboxGitSync={session.sandboxGitSync}
      prState={session.prState}
      messages={messages ?? []}
      isLoadingMessages={messages === undefined}
      queuedMessages={queuedMessages ?? []}
      streamingActivity={streaming?.currentActivity}
      streamingContent={streaming?.currentContent}
      streamingPendingQuestion={streaming?.pendingQuestion}
      startupStreamingActivity={startupStreaming?.currentActivity}
      isSandboxActive={isSandboxActive}
      isSandboxToggling={isSandboxStarting || isSandboxStopping}
      isSandboxStopping={isSandboxStopping}
      onSandboxToggle={handleSandboxToggle}
      isArchived={isArchived}
      isReadOnly={isArchived}
      isRouteActive={isRouteActive}
      onOpenFile={onOpenFile}
      onViewDiff={handleViewDiff}
      onOpenPrdTab={openPrdTab}
      onOpenAgentsTab={openAgentsTab}
      backgroundAgents={activeChat.backgroundAgents}
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
            leftPanel={() => chatPanel}
            rightPanel={({ rightPanelCollapsed, onToggleRightPanel }) => (
              <SandboxPanel
                sessionId={sessionId}
                chatId={activeChat._id}
                sandboxId={session.sandboxId}
                isActive={isSandboxActive}
                isRouteActive={isRouteActive}
                repoId={session.repoId}
                prUrl={session.prUrl}
                devPort={session.devPort ?? repo.devPort}
                devCommand={session.devCommand ?? repo.devCommand}
                owner={owner}
                panes={panes}
                terminalPanel={terminalPanel}
                planContent={session.planContent}
                messages={messages ?? []}
                backgroundAgents={activeChat.backgroundAgents}
                streamingActivity={streaming?.currentActivity}
                isArchived={isArchived}
                activeTab={activeSandboxTab}
                onTabChange={onSandboxTabChange}
                agentBrowsingAt={session.agentBrowsingAt}
                onStartSandbox={
                  isArchived || isSandboxStopping
                    ? undefined
                    : () => {
                        void handleSandboxToggle("start");
                      }
                }
                isSandboxStarting={isSandboxStarting}
                autoWakeEligible={
                  session.status === "closed" &&
                  session.sandboxId !== undefined &&
                  session.sandboxError === undefined &&
                  !isArchived
                }
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
