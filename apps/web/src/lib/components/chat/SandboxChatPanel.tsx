"use client";

import type { ProjectChatTaskCards } from "@/lib/components/projects/ProjectChatTaskCard";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { sandboxChatEmptyState, sandboxComposerState } from "@eva/shared";
import { sandboxStartupTail } from "@/lib/components/StreamingActivityDisplay";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useOlderTranscript,
  type TranscriptMessage,
} from "@/lib/hooks/useChatTranscript";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { ChatBody, type ChatBodyProps } from "./ChatBody";
import { SandboxBranchChip } from "./SandboxBranchChip";
import {
  sandboxTurnSettings,
  usageAccountLabel,
  useSandboxChatTranscript,
  type SandboxChatBinding,
} from "./sandboxChatBinding";
import {
  SandboxChatPreInput,
  SandboxChatStatusChips,
} from "./SandboxChatPreInput";
import {
  buildSandboxChatSurface,
  startSandboxHandler,
} from "./sandboxChatSurface";
import { sandboxChatKeys } from "./sandboxChatTurn";
import { SubagentThreadLayer } from "./SubagentThreadLayer";
import { ViewPrsChip } from "./ViewPrsChip";
import { useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { replyThreadParser } from "@/lib/search-params";
import { ThreadTurnStatus } from "@/lib/components/chat/replies/ThreadTurnStatus";
import { useChatQueueGate } from "./useChatQueueGate";
import { useChatSend, type ChatTurnSendOptions } from "./useChatSend";
import { useSandboxChatDraft } from "./useSandboxChatDraft";

/** What the page around a sandbox chat hands it. */
export interface SandboxChatPanelProps {
  isSandboxActive: boolean;
  /** Starting or stopping. */
  isSandboxToggling?: boolean;
  /** Stopping (not a start): the empty state says so. */
  isSandboxStopping?: boolean;
  /** Startup steps while the preview sandbox wakes; undefined otherwise. */
  sandboxStartupActivity?: string;
  /** Opens the Files tab and loads this sandbox path in the file viewer. */
  onOpenFile?: (path: string) => void;
  /** Opens Review diffs; optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  /** A project's coordinator chat: task cards under Eva's replies (`ChatBody`). */
  projectTaskCards?: ProjectChatTaskCards;
  onSandboxToggle?: (action: "start" | "stop") => void;
  /** The owner is archived: the chat is read-only (no composer, no wake). */
  isArchived?: boolean;
  /** A row above the chat (a project's chat tabs). */
  headerLeft?: ReactNode;
}

/** The live chat state a host's slots read. */
export interface SandboxChatState {
  isExecuting: boolean;
  /** The live transcript; undefined while it loads. */
  messages: TranscriptMessage[] | undefined;
  queuedCount: number;
  handleSend: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
    options?: ChatTurnSendOptions,
  ) => Promise<void>;
  /** The usage chip's account name. */
  usageAccountLabel: string;
}

/** Owner-only parts a host adds around and inside the shared chat. */
interface SandboxChatSlots {
  /**
   * Wraps the chat in the host's own page header (a session's header, tabs
   * and read-only banner). Default: `headerLeft` above the chat.
   */
  frame?: (chat: ReactNode, state: SandboxChatState) => ReactNode;
  /** Rows above the usage-limit card (a session's publish recovery). */
  beforeBanner?: (state: SandboxChatState) => ReactNode;
  /** Chips after the agents chip (a session's background processes). */
  statusChips?: ReactNode;
  /** In place of the startup block when set (a session's slot wait). */
  transcriptTail?: (state: SandboxChatState) => ReactNode;
  /** Under a message (a session's proposed plans). */
  afterMessage?: (messageId: string, state: SandboxChatState) => ReactNode;
  onForkTranscript?: ChatBodyProps["onForkTranscript"];
  turnCheckpoint?: ChatBodyProps["turnCheckpoint"];
}

const OWNER_TITLE: Record<SandboxChatBinding["ownerLabel"], string> = {
  session: "Session",
  task: "Task",
  project: "Project",
};

/**
 * The sandbox chat for a session, a quick task, a project task or a
 * project. The owner only supplies a binding (and a session its slots); the
 * transcript, send rule, failure toasts, queue gate, account handoff,
 * blocking question, empty state and read-only rules are the same for all.
 */
export function SandboxChatPanel({
  binding,
  isSandboxActive,
  isSandboxToggling = false,
  isSandboxStopping = false,
  sandboxStartupActivity,
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  projectTaskCards,
  onSandboxToggle,
  isArchived = false,
  headerLeft,
  assistantBubbles = false,
  replyThreads = false,
  onThreadOpen,
  emptyState,
  frame,
  beforeBanner,
  statusChips,
  transcriptTail,
  afterMessage,
  onForkTranscript,
  turnCheckpoint,
}: SandboxChatPanelProps &
  SandboxChatSlots & {
    binding: SandboxChatBinding;
    /** Eva's replies in a bubble with her mark (the project coordinator). */
    assistantBubbles?: boolean;
    /**
     * Messages take replies in threads (the project coordinator). The open
     * thread is the `?thread=` param; the page shows it beside the chat.
     */
    replyThreads?: boolean;
    /**
     * Opens a thread the page's way (the project rail's Replies tab). Without
     * it, opening only sets `?thread=`.
     */
    onThreadOpen?: (messageId: string) => void;
    /** In place of the empty chat (`ChatBody` `emptyState`). */
    emptyState?: ReactNode;
  }) {
  const { repo, basePath } = useRepo();
  const [, setThreadId] = useQueryState("thread", replyThreadParser);
  const { entity, doc, model, ownerLabel, active } = binding;
  // All undefined until the owner's session exists: nothing to read yet, and
  // the first send creates it.
  const { parentId, streamingEntityId, draftTarget } = sandboxChatKeys(entity);
  // A hidden cached session shell reads nothing live; held reads keep what
  // it last painted.
  const liveParentId = active ? parentId : undefined;
  const { messages, isExecuting } = useSandboxChatTranscript(binding);
  // `messages` is the live part; the rendered transcript adds the history
  // above it once the reader goes there.
  const history = useOlderTranscript({
    parentId: liveParentId ?? "skip",
    live: messages,
    active,
  });
  const queuedMessages = useHeldQuery(
    api.queuedMessages.listByParent,
    liveParentId ? { parentId: liveParentId } : "skip",
  );
  const chatStreaming = useHeldQuery(
    api.streaming.get,
    active && streamingEntityId ? { entityId: streamingEntityId } : "skip",
  );
  // Eva's open turn answers in a reply thread: the main chat shows no running
  // bubble for it, only a status line that opens the thread.
  const threadTurn = useHeldQuery(
    api.messages.openThreadTurn,
    replyThreads && liveParentId ? { parentId: liveParentId } : "skip",
  );
  const streaming = threadTurn ? undefined : chatStreaming;
  const openThread = (messageId: string) => {
    if (onThreadOpen) onThreadOpen(messageId);
    else void setThreadId(messageId);
  };
  // Same entityId the sandbox posts with (the entity id, not the stream key).
  const blockingQuestion = useHeldQuery(
    api.pendingQuestions.getActive,
    liveParentId ? { entityId: liveParentId } : "skip",
  );
  const answerPendingQuestion = useMutation(api.pendingQuestions.answer);
  const { draftBundle, isDraftLoading } = useSandboxChatDraft(draftTarget);
  const accountId = binding.providerAccountId ?? null;

  const queueGate = useChatQueueGate({
    parentId,
    messages: messages ?? [],
    queuedMessages: queuedMessages ?? [],
    model,
    accountId,
    accounts: binding.accounts,
    resolveAccountId: binding.resolveAccountId,
    isSandboxActive,
    setModel: binding.setModel,
    setAccount: (next) =>
      binding.switchProviderAccount(binding.resolveAccountId(next) ?? null),
  });
  const composer = sandboxComposerState({
    isSandboxActive,
    isSwitchingAccount: binding.isSwitchingAccount,
    isExecuting,
    isUsageLimitHeld: queueGate.isUsageLimitHeld,
  });
  const empty = sandboxChatEmptyState({
    isSandboxActive,
    isSandboxStopping,
    isSandboxToggling,
    activeTitle: `Ask Eva anything about this ${ownerLabel}'s running sandbox.`,
  });

  const { handleSend, handleCancel, hasPendingReviewComments } = useChatSend({
    ports: binding.ports,
    settings: sandboxTurnSettings(binding),
    cancel: binding.cancel,
    draftTarget,
    isExecuting,
    queuesSends: composer.queuesSends,
  });

  const handleAnswerBlockingQuestion = async (
    toolUseId: string,
    answers: Record<string, string>,
  ) => {
    if (!parentId) return;
    await catchMutationError(
      answerPendingQuestion({
        entityId: parentId,
        toolUseId,
        answer: JSON.stringify(answers),
      }),
      "Couldn't submit answer",
      "sandbox-pending-answer",
    );
  };

  const chatSurface = buildSandboxChatSurface({
    entity,
    repoId: repo._id,
    model,
    isExecuting,
    isReadOnly: isArchived,
    doc,
    // A stopped sandbox still gets the offer: sending wakes it. Until the
    // sticky account loads there is no account to exclude, so no offer.
    canSwitchAccount: !isArchived && binding.providerAccountId !== undefined,
    messages,
    accounts: binding.accounts,
    resolveAccountId: binding.resolveAccountId,
    switchProviderAccount: binding.switchProviderAccount,
    isSandboxActive,
    sendCommand: isArchived
      ? undefined
      : (command) =>
          handleSend(command, undefined, { skipReviewComments: true }),
  });

  const state: SandboxChatState = {
    isExecuting,
    messages,
    queuedCount: queuedMessages?.length ?? 0,
    handleSend,
    usageAccountLabel: usageAccountLabel(binding),
  };
  const chatMessages = history.messages ?? messages ?? [];
  const isSandboxStarting = isSandboxToggling && !isSandboxStopping;

  const chat = (
    <SubagentThreadLayer
      surface={chatSurface}
      parentTitle={doc?.title ?? OWNER_TITLE[ownerLabel]}
      messages={chatMessages}
      streamingActivity={streaming?.currentActivity}
      sandboxRunning={isSandboxActive}
      onOpenFile={onOpenFile}
    >
      <ChatBody
        repo={{ id: repo._id, basePath }}
        conversationId={parentId ?? `${ownerLabel}-chat`}
        chatParentId={parentId}
        isRouteActive={active}
        messages={chatMessages}
        // No chat yet (the first send or run creates it): nothing loads.
        isLoadingMessages={parentId !== undefined && messages === undefined}
        hasOlderHistory={history.hasOlder}
        onLoadOlderHistory={history.loadOlder}
        onReachHistory={history.reach}
        isReachingHistory={history.isReaching}
        queuedMessages={queuedMessages ?? []}
        queueLabel={queueGate.queueLabel(isExecuting)}
        streamingActivity={streaming?.currentActivity}
        streamingContent={streaming?.currentContent}
        streamingPendingQuestion={streaming?.pendingQuestion}
        // A thread turn's question is answered in its thread.
        blockingQuestion={threadTurn ? undefined : (blockingQuestion ?? undefined)}
        onAnswerBlockingQuestion={handleAnswerBlockingQuestion}
        isExecuting={isExecuting}
        isInputDisabled={composer.isInputDisabled}
        isArchived={isArchived}
        placeholder={composer.placeholder}
        emptyStateTitle={empty.title}
        emptyStateDescription={empty.description}
        emptyState={emptyState}
        disabledReason={composer.disabledReason}
        onStartSandbox={startSandboxHandler(
          isSandboxActive,
          isSandboxToggling,
          isArchived ? undefined : onSandboxToggle,
        )}
        modelPicker={{
          model,
          setModel: queueGate.setModel,
          modelOptions: binding.modelOptions,
          accounts: binding.accounts,
          accountId,
          onAccountChange: queueGate.setAccount,
          displayTraits: binding.displayTraits,
          onTraitsChange: binding.onTraitsChange,
        }}
        onSend={handleSend}
        onCancel={handleCancel}
        onForkTranscript={onForkTranscript}
        afterMessage={
          afterMessage
            ? (messageId) => afterMessage(messageId, state)
            : undefined
        }
        turnCheckpoint={turnCheckpoint}
        preInputContent={
          <>
            {threadTurn ? (
              <ThreadTurnStatus
                preview={threadTurn.preview}
                hasQuestion={threadTurn.hasQuestion}
                onOpen={() => openThread(threadTurn.rootId)}
              />
            ) : null}
            <SandboxChatPreInput
              surface={chatSurface}
              beforeBanner={beforeBanner?.(state)}
            />
          </>
        }
        composerChips={
          <SandboxChatStatusChips surface={chatSurface}>
            <ViewPrsChip owner={binding.prOwner} />
            {statusChips}
          </SandboxChatStatusChips>
        }
        underCardLeading={
          <SandboxBranchChip
            branch={doc?.sandboxBranch}
            isSandboxActive={isSandboxActive}
            intendedBranch={binding.intendedBranch}
          />
        }
        draft={draftBundle}
        isDraftLoading={isDraftLoading}
        onOpenFile={onOpenFile}
        onViewDiff={onViewDiff}
        hasPendingContext={hasPendingReviewComments}
        onOpenAgentsTab={onOpenAgentsTab}
        projectTaskCards={projectTaskCards}
        assistantBubbles={assistantBubbles}
        onOpenThread={replyThreads ? openThread : undefined}
        backgroundAgents={doc?.backgroundAgents}
        sandboxRunning={isSandboxActive}
        transcriptTail={
          transcriptTail?.(state) ??
          // A running turn shows its own bubble; the startup block is for a
          // wake with nothing else on screen.
          sandboxStartupTail(
            sandboxStartupActivity,
            isSandboxStarting && !isSandboxActive && !isExecuting,
          )
        }
      />
    </SubagentThreadLayer>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {frame ? (
        frame(chat, state)
      ) : (
        <>
          {headerLeft}
          {chat}
        </>
      )}
      {queueGate.switchDialog}
    </div>
  );
}
