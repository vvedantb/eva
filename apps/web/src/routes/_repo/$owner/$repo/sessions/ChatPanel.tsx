import { api, normalizeAIModel, type Doc, type Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { ChatPageWrapper } from "@/lib/components/ChatPageWrapper";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { StreamingActivityDisplay } from "@/lib/components/StreamingActivityDisplay";
import { SessionPrdPlanView } from "./_components/SessionPrdPlanView";
import { ComposerPlanReadyBanner } from "./_components/ComposerPlanReadyBanner";
import { SandboxChatPreInput } from "@/lib/components/chat/SandboxChatPreInput";
import type { SandboxChatSurface } from "@/lib/components/chat/sandboxChatSurface";
import { BackgroundProcessesPanel } from "./_components/BackgroundProcessesPanel";
import { SessionChatHeader } from "./_components/SessionChatHeader";
import { SessionSummaryAccordion } from "./_components/SessionSummaryAccordion";
import { SessionSummaryModal } from "./_components/SessionSummaryModal";
import { SessionReviewModal } from "./_components/SessionReviewModal";
import { useChatSend, type SessionMessage } from "./_components/useChatSend";
import { ChatTabsBar } from "./_components/ChatTabsBar";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useChatModel } from "@/lib/hooks/useChatModel";
import {
  useAvailableAiModels,
  useSessionOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import { useSeedChatDraft } from "@/lib/components/chat/useSeedChatDraft";
import { PendingReviewCommentChips } from "@/lib/components/chat/PendingReviewCommentChips";
import { AveResetChatDialog } from "@/lib/components/ave/AveResetChatDialog";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { getSessionReadOnlyMessage } from "./_utils/sessionReadOnly";
import { APPROVE_PLAN_PROMPT } from "./_utils/composerPrompts";
import { motionBase } from "@eva/ui";

type QueuedSessionMessage = NonNullable<
  FunctionReturnType<typeof api.queuedMessages.listByParent>
>[number];

type ChatTurnStatus = FunctionReturnType<
  typeof api.turns.listSessionChatStatuses
>[number];

interface ChatPanelProps {
  sessionId: Id<"sessions">;
  /** The chat tab this panel shows; the transcript, turn and model are its own. */
  chat: Doc<"sessionChats">;
  /** Every chat of the session, for the tab strip. */
  chats: Doc<"sessionChats">[];
  /** Open turns across the session's chats (tab dots + the slot-wait caption). */
  chatStatuses: ChatTurnStatus[];
  onSelectChat: (chat: Doc<"sessionChats">) => void;
  onCreateChat: () => void;
  isCreatingChat: boolean;
  title: string;
  branchName?: string;
  prUrl?: string;
  prState?: "draft" | "open" | "merged" | "closed";
  summary?: string[];
  messages: SessionMessage[];
  queuedMessages: QueuedSessionMessage[];
  planContent?: string;
  streamingActivity?: string;
  streamingContent?: string;
  streamingPendingQuestion?: string;
  summaryStreamingActivity?: string;
  startupStreamingActivity?: string;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  /** True while status is stopping / stop mutation in flight — not a start. */
  isSandboxStopping?: boolean;
  onSandboxToggle: (action: "start" | "stop") => void;
  isArchived?: boolean;
  /** Archive or PR merged/closed — hides composer and shows read-only banner. */
  isReadOnly?: boolean;
  deploymentStatus?: "queued" | "building" | "deployed" | "error";
  sandboxCollapsed?: boolean;
  /** Canonical link to this session; omitted when the URL already is one. */
  permalinkPath?: string;
  /** Chat-only surface (the orchestrator): hides branch/PR affordances. */
  chatOnly?: boolean;
  /** Popover already titles the surface — omit the session-chat title. */
  hideTitle?: boolean;
  /** Opens a file (by full sandbox path) in the File Viewer tab. */
  onOpenFile?: (path: string) => void;
  /** Opens the Diffs tab; optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /** Opens the PRD sandbox tab (used by the Plan Ready banner). */
  onOpenPrdTab?: () => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  backgroundAgents?: Doc<"sessionChats">["backgroundAgents"];
}

/** Sessions run at most this many chats at once; mirrors the server cap. */
const MAX_PARALLEL_CHATS = 3;

export function ChatPanel({
  sessionId,
  chat,
  chats,
  chatStatuses,
  onSelectChat,
  onCreateChat,
  isCreatingChat,
  title,
  branchName,
  prUrl,
  prState,
  summary,
  messages,
  queuedMessages,
  planContent,
  streamingActivity,
  streamingContent,
  streamingPendingQuestion,
  summaryStreamingActivity,
  startupStreamingActivity,
  isSandboxActive,
  isSandboxToggling,
  isSandboxStopping = false,
  onSandboxToggle,
  isArchived = false,
  isReadOnly = false,
  deploymentStatus,
  sandboxCollapsed,
  permalinkPath,
  chatOnly,
  hideTitle = false,
  onOpenFile,
  onViewDiff,
  onOpenPrdTab,
  onOpenAgentsTab,
  backgroundAgents,
}: ChatPanelProps) {
  const { repo, basePath } = useRepo();
  const chatId = chat._id;
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showResetChatDialog, setShowResetChatDialog] = useState(false);

  const defaultModel = normalizeAIModel(repo.defaultModel);
  // The picker lists the session owner's accounts, not the viewer's — the turn
  // always runs on the owner's credentials.
  const { options: accounts, resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId);
  // Model + traits + account are owned by Convex, per chat tab.
  const {
    model,
    setModel,
    traits,
    setTraits,
    providerAccountId: stickyProviderAccountId,
    setProviderAccountId: setStickyProviderAccountId,
    isSwitchingAccount,
  } = useChatModel(chatId, defaultModel);
  const {
    displayTraits,
    executionTraits,
    onTraitsChange,
    providerAccountId,
    setProviderAccountId,
  } = useSessionSettings({
    defaultModel,
    model,
    onModelChange: setModel,
    traits,
    onTraitsPersist: setTraits,
    providerAccountId: stickyProviderAccountId,
    onProviderAccountChange: (next: string | null) => {
      setStickyProviderAccountId(
        next === null ? null : (resolveAccountId(next) ?? null),
      );
    },
  });
  // Every visible model, across providers: a session may be moved onto another
  // provider mid-conversation, and each pick carries the account it was made
  // under so credentials follow the new provider.
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);

  const draftTarget = { kind: "sessionChat" as const, sessionId, chatId };
  const draftSeed = useChatDraftSeed(draftTarget);
  const seedChatDraft = useSeedChatDraft(draftTarget);
  const draftBundle = draftSeed.isReady
    ? {
        target: draftTarget,
        initialDisplay: draftSeed.initialDisplay,
        mentionMap: draftSeed.mentionMap,
        skillMap: draftSeed.skillMap,
      }
    : undefined;

  const review = usePendingReviewComments();
  const hasPendingReviewComments = (review?.comments.length ?? 0) > 0;

  const { isExecuting, handleSend, handleCancel } = useChatSend({
    chatId,
    model,
    executionTraits,
    reasoningLevel: displayTraits.effortLevel,
    providerAccountId,
    resolveAccountId,
    accounts,
    messages,
  });

  const chatSurface: SandboxChatSurface = {
    entity: { kind: "session", sessionId, chatId },
    repoId: repo._id,
    model,
    isExecuting,
    isReadOnly,
    // A stopped session sandbox still gets the offer: sending wakes it.
    compactionReadOnly: isReadOnly,
    backgroundAgents,
    // Review comments are appended to normal sends; a slash command has to
    // reach the harness verbatim.
    onSendCommand: (command) => {
      void handleSend(command, undefined, { skipReviewComments: true });
    },
  };

  const activeQuestion = useQuery(api.pendingQuestions.getActive, {
    entityId: chatId,
  });
  const answerPendingQuestion = useMutation(api.pendingQuestions.answer);
  const handleAnswerBlockingQuestion = async (
    toolUseId: string,
    answers: Record<string, string>,
  ) => {
    await catchMutationError(
      answerPendingQuestion({
        entityId: chatId,
        toolUseId,
        answer: JSON.stringify(answers),
      }),
      "Couldn't submit answer",
      "session-pending-answer",
    );
  };

  const hasSummary = Boolean(summary && summary.length > 0);
  const isStartupStreaming =
    isSandboxToggling && !isSandboxActive && !isSandboxStopping;

  const usageAccountLabel =
    stickyProviderAccountId === null
      ? "Team"
      : stickyProviderAccountId === undefined
        ? "Selected account"
        : (accounts.find((account) => account.id === stickyProviderAccountId)
            ?.label ?? "Selected account");

  const runningChatIds = new Set<string>(
    chatStatuses.map((status) => status.chatId),
  );
  const chatTabs = chatOnly ? undefined : (
    <ChatTabsBar
      chats={chats}
      activeChatId={chatId}
      runningChatIds={runningChatIds}
      onSelect={onSelectChat}
      onCreate={onCreateChat}
      isReadOnly={isReadOnly}
      isCreating={isCreatingChat}
    />
  );
  // Queued on this chat while the session's run slots are all taken: the
  // server parked the send instead of starting it (see `startExecute`).
  const isWaitingForSlot =
    !isExecuting &&
    queuedMessages.length > 0 &&
    runningChatIds.size >= MAX_PARALLEL_CHATS;

  const { headerLeft, headerRight } = SessionChatHeader({
    repoId: repo._id,
    sessionId,
    chatId,
    title,
    branchName,
    prUrl,
    prState,
    hasSummary,
    messageCount: messages.length,
    isSandboxActive,
    isSandboxToggling,
    isAssistantResponding: isExecuting,
    deploymentStatus,
    permalinkPath,
    chatOnly,
    hideTitle,
    model,
    providerAccountId: stickyProviderAccountId,
    usageAccountLabel,
    onSandboxToggle,
    onOpenSummaryModal: () => setShowSummaryModal(true),
    onOpenReviewModal: () => setShowReviewModal(true),
    // Only Manager Ave can be reset: it is the one chat the user cannot simply
    // replace by opening a new session.
    onOpenResetChatDialog: chatOnly
      ? () => setShowResetChatDialog(true)
      : undefined,
  });

  const startupStreamingNode = (
    <div className="rounded-surface bg-secondary p-4">
      <StreamingActivityDisplay
        activity={startupStreamingActivity}
        thinkingLabel="Starting sandbox..."
      />
    </div>
  );

  const emptyStateOverride = isStartupStreaming ? (
    <div className="flex flex-col items-center justify-center py-8">
      <StreamingActivityDisplay
        activity={startupStreamingActivity}
        thinkingLabel="Starting sandbox..."
      />
    </div>
  ) : null;

  const beforeQueuedContent = isStartupStreaming ? (
    startupStreamingNode
  ) : isWaitingForSlot ? (
    <p className="px-1 text-xs text-muted-foreground">
      Waiting for a free slot — {runningChatIds.size} of {MAX_PARALLEL_CHATS}{" "}
      chats in this session are running.
    </p>
  ) : null;

  const hasPlanContent =
    typeof planContent === "string" && planContent.trim().length > 0;
  // Compact card above the composer only while the sandbox pane is collapsed —
  // otherwise the PRD tab owns the plan and the slim strip links to it.
  const showCompactPlanCard = hasPlanContent && sandboxCollapsed !== false;
  // When the card is hidden but a plan exists, show a slim Plan Ready strip.
  const showPlanReadyBanner = hasPlanContent && !showCompactPlanCard;

  const handleApprovePlan = () => {
    void seedChatDraft(APPROVE_PLAN_PROMPT);
  };

  const handleViewPlan = () => {
    onOpenPrdTab?.();
  };

  const preInputContent = (
    <SandboxChatPreInput
      surface={chatSurface}
      beforeBanner={
        <>
          <BackgroundProcessesPanel sessionId={sessionId} />
          <PendingReviewCommentChips />
        </>
      }
      afterBanner={
        <>
          {showCompactPlanCard && planContent ? (
            <AnimatePresence initial={false}>
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={motionBase}
              >
                <SessionPrdPlanView
                  sessionId={sessionId}
                  planContent={planContent}
                  onApprovePlan={handleApprovePlan}
                  variant="compact"
                  isArchived={isReadOnly}
                />
              </m.div>
            </AnimatePresence>
          ) : null}
          {showPlanReadyBanner && planContent ? (
            <ComposerPlanReadyBanner
              planContent={planContent}
              onViewPlan={handleViewPlan}
              onApprovePlan={handleApprovePlan}
              isArchived={isReadOnly}
            />
          ) : null}
        </>
      }
    />
  );

  const emptyStateTitle = isSandboxActive
    ? "No messages yet. Start the conversation!"
    : isSandboxStopping
      ? "Stopping sandbox..."
      : isSandboxToggling
        ? "Starting sandbox..."
        : "Wake Eva up to begin chatting.";

  const placeholder = !isSandboxActive
    ? "Wake Eva up to begin chatting..."
    : isSwitchingAccount
      ? "Switching Claude account..."
      : "Ask Eva anything... / for skills · @ to mention";

  const readOnlyMessage = getSessionReadOnlyMessage({
    isArchived,
    prState,
  });

  return (
    <ChatPageWrapper
      title={title}
      readOnlyMessage={readOnlyMessage}
      headerLeft={headerLeft}
      headerRight={headerRight}
      tabs={chatTabs}
    >
      <ChatBody
        repoId={repo._id}
        repoBasePath={basePath}
        conversationId={chatId}
        messages={messages}
        queuedMessages={queuedMessages}
        streamingActivity={streamingActivity}
        streamingContent={streamingContent}
        streamingPendingQuestion={streamingPendingQuestion}
        blockingQuestion={activeQuestion ?? undefined}
        onAnswerBlockingQuestion={handleAnswerBlockingQuestion}
        isExecuting={isExecuting}
        isInputDisabled={!isSandboxActive || isSwitchingAccount}
        isArchived={isReadOnly}
        placeholder={placeholder}
        emptyStateTitle={emptyStateTitle}
        emptyStateOverride={emptyStateOverride}
        beforeQueuedContent={beforeQueuedContent}
        preInputContent={preInputContent}
        preConversationContent={
          <SessionSummaryAccordion
            summary={summary}
            summaryStreamingActivity={summaryStreamingActivity}
          />
        }
        model={model}
        setModel={setModel}
        modelOptions={modelOptions}
        accounts={accounts}
        accountId={providerAccountId}
        onAccountChange={setProviderAccountId}
        displayTraits={displayTraits}
        onTraitsChange={onTraitsChange}
        onSend={handleSend}
        onCancel={handleCancel}
        draft={draftBundle}
        isDraftLoading={!draftSeed.isReady}
        onOpenFile={onOpenFile}
        onViewDiff={prUrl ? onViewDiff : undefined}
        hasPendingContext={hasPendingReviewComments}
        onOpenAgentsTab={onOpenAgentsTab}
        backgroundAgents={backgroundAgents}
        sandboxRunning={isSandboxActive}
      />
      <SessionSummaryModal
        sessionId={sessionId}
        hasSummary={hasSummary}
        open={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
      />
      <SessionReviewModal
        sessionId={sessionId}
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
      />
      {chatOnly && (
        <AveResetChatDialog
          open={showResetChatDialog}
          onOpenChange={setShowResetChatDialog}
        />
      )}
    </ChatPageWrapper>
  );
}
