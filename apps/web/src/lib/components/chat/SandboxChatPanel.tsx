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
  isSandboxToggling?: boolean;
  isSandboxStopping?: boolean;
  sandboxStartupActivity?: string;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  onOpenAgentsTab?: () => void;
  projectTaskCards?: ProjectChatTaskCards;
  onSandboxToggle?: (action: "start" | "stop") => void;
  isArchived?: boolean;
  headerLeft?: ReactNode;
}

/** The live chat state a host's slots read. */
export interface SandboxChatState {
  isExecuting: boolean;
  messages: TranscriptMessage[] | undefined;
  queuedCount: number;
  handleSend: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
    options?: ChatTurnSendOptions,
  ) => Promise<void>;
  usageAccountLabel: string;
}

interface SandboxChatSlots {
  frame?: (chat: ReactNode, state: SandboxChatState) => ReactNode;
  beforeBanner?: (state: SandboxChatState) => ReactNode;
  statusChips?: ReactNode;
  transcriptTail?: (state: SandboxChatState) => ReactNode;
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
    assistantBubbles?: boolean;
    replyThreads?: boolean;
    onThreadOpen?: (messageId: string) => void;
    emptyState?: ReactNode;
  }) {
  const { repo, basePath } = useRepo();
  const [, setThreadId] = useQueryState("thread", replyThreadParser);
  const { entity, doc, model, ownerLabel, active } = binding;
  const { parentId, streamingEntityId, draftTarget } = sandboxChatKeys(entity);
  const liveParentId = active ? parentId : undefined;
  const { messages, isExecuting } = useSandboxChatTranscript(binding);
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
  const threadTurn = useHeldQuery(
    api.messages.openThreadTurn,
    replyThreads && liveParentId ? { parentId: liveParentId } : "skip",
  );
  const streaming = threadTurn ? undefined : chatStreaming;
  const openThread = (messageId: string) => {
    if (onThreadOpen) onThreadOpen(messageId);
    else void setThreadId(messageId);
  };
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
