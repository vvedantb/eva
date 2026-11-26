import type { PrState } from "@eva/shared";
import { api, normalizeAIModel, type Doc, type Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { ChatPageWrapper } from "@/lib/components/ChatPageWrapper";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { SandboxBranchChip } from "@/lib/components/chat/SandboxBranchChip";
import {
  MAX_PARALLEL_CHATS,
  sandboxComposerState,
  SANDBOX_CHAT_COPY,
} from "@eva/shared";
import { sandboxStartupTail } from "@/lib/components/StreamingActivityDisplay";
import {
  SandboxChatPreInput,
  SandboxChatStatusChips,
} from "@/lib/components/chat/SandboxChatPreInput";
import { useChatQueueGate } from "@/lib/components/chat/useChatQueueGate";
import { buildSandboxChatSurface } from "@/lib/components/chat/sandboxChatSurface";
import { SubagentThreadLayer } from "@/lib/components/chat/SubagentThreadLayer";
import { useChatSend } from "@/lib/components/chat/useChatSend";
import { useSandboxChatDraft } from "@/lib/components/chat/useSandboxChatDraft";
import { isChatTurnExecuting } from "@/lib/components/chat/chatBodyUtils";
import {
  useOlderTranscript,
  type TranscriptMessage,
} from "@/lib/hooks/useChatTranscript";
import { BackgroundProcessesChip } from "./_components/BackgroundProcessesChip";
import { PublishRecoveryBanner } from "./_components/PublishRecoveryBanner";
import { useSessionChatHeader } from "./_components/SessionChatHeader";
import {
  SessionReviewModal,
  useSendSessionForReview,
} from "./_components/SessionReviewModal";
import { useSessionTurnPorts } from "./_components/useSessionTurnPorts";
import { ChatTabsBar } from "./_components/ChatTabsBar";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useChatModel } from "@/lib/hooks/useChatModel";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  useAvailableAiModels,
  useSessionOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { toast, useRequestConfirm } from "@vvedantb/ui";
import { getSessionReadOnlyMessage } from "./_utils/sessionReadOnly";
import { ProposedPlanCard } from "./_components/ProposedPlanCard";
import { proposedPlanForMessage } from "@eva/shared/proposedPlan";
import { useSessionPlanImplementation } from "./_components/useSessionPlanImplementation";
import { useSessionPlanDocument } from "./_components/useSessionPlanDocument";

type QueuedSessionMessage = NonNullable<
  FunctionReturnType<typeof api.queuedMessages.listByParent>
>[number];

type ChatTurnStatus = FunctionReturnType<
  typeof api.turns.listSessionChatStatuses
>[number];

interface ChatPanelProps {
  sessionId: Id<"sessions">;
  session: Doc<"sessions">;
  chat: Doc<"sessionChats">;
  chats: Doc<"sessionChats">[];
  chatStatuses: ChatTurnStatus[];
  onSelectChat: (chat: Doc<"sessionChats">) => void;
  onCreateChat: () => void;
  isCreatingChat: boolean;
  title: string;
  branchName?: string;
  sandboxBranch?: string;
  sandboxGitSync?: Doc<"sessions">["sandboxGitSync"];
  prState?: PrState;
  messages: TranscriptMessage[];
  isLoadingMessages: boolean;
  queuedMessages: QueuedSessionMessage[];
  streamingActivity?: string;
  streamingContent?: string;
  streamingPendingQuestion?: string;
  startupStreamingActivity?: string;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  isSandboxStopping?: boolean;
  onSandboxToggle: (action: "start" | "stop") => void;
  isArchived?: boolean;
  isReadOnly?: boolean;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  onOpenPrdTab?: () => void;
  onOpenAgentsTab?: () => void;
  backgroundAgents?: Doc<"sessionChats">["backgroundAgents"];
  isRouteActive?: boolean;
}

export function ChatPanel({
  sessionId,
  session,
  chat,
  chats,
  chatStatuses,
  onSelectChat,
  onCreateChat,
  isCreatingChat,
  title,
  branchName,
  sandboxBranch,
  sandboxGitSync,
  prState,
  messages,
  isLoadingMessages,
  queuedMessages,
  streamingActivity,
  streamingContent,
  streamingPendingQuestion,
  startupStreamingActivity,
  isSandboxActive,
  isSandboxToggling,
  isSandboxStopping = false,
  onSandboxToggle,
  isArchived = false,
  isReadOnly = false,
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  backgroundAgents,
  isRouteActive = true,
}: ChatPanelProps) {
  const { repo, basePath } = useRepo();
  const chatId = chat._id;
  const history = useOlderTranscript({
    parentId: isRouteActive ? chatId : "skip",
    live: isLoadingMessages ? undefined : messages,
    active: isRouteActive,
  });
  const transcript = history.messages ?? messages;
  const navigate = useNavigate();
  const createSession = useMutation(api.sessions.create);
  const simpleView = useSimpleView();
  const [showReviewModal, setShowReviewModal] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();
  const { sendForReview } = useSendSessionForReview(sessionId);

  const defaultModel = normalizeAIModel(repo.defaultModel);
  const { options: accounts, resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId, isRouteActive);
  const {
    model,
    setModel,
    traits,
    setTraits,
    providerAccountId: stickyProviderAccountId,
    setProviderAccountId: setStickyProviderAccountId,
    isSwitchingAccount,
  } = useChatModel(chatId, defaultModel, isRouteActive);
  const { displayTraits, executionTraits, onTraitsChange, providerAccountId } =
    useSessionSettings({
      defaultModel,
      model,
      onModelChange: setModel,
      traits,
      onTraitsPersist: setTraits,
      providerAccountId: stickyProviderAccountId,
    });
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);

  const draftTarget = { kind: "sessionChat" as const, sessionId, chatId };
  const { draftBundle, isDraftLoading } = useSandboxChatDraft(draftTarget);

  const handleForkTranscript = async (input: {
    throughMessageId: string;
    title: string;
    prompt: string;
  }) => {
    const accountId = resolveAccountId(providerAccountId) ?? null;
    try {
      const { numId } = await createSession({
        repoId: repo._id,
        title: input.title,
        message: input.prompt,
        model,
        ...executionTraits,
        reasoningLevel: displayTraits.effortLevel,
        thinkingEnabled: displayTraits.thinkingEnabled,
        use1mContext: displayTraits.use1mContext,
        fastMode: displayTraits.fastMode,
        providerAccountId: accountId,
      });
      await navigate({
        to: toInternalRepoHref(`${basePath}/sessions/${numId}`),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't fork this chat";
      toast.error(message);
      throw error;
    }
  };

  const queueGate = useChatQueueGate({
    parentId: chatId,
    messages,
    queuedMessages,
    model,
    accountId: providerAccountId,
    accounts,
    resolveAccountId,
    isSandboxActive,
    setModel,
    setAccount: (next) =>
      setStickyProviderAccountId(
        next === null ? null : (resolveAccountId(next) ?? null),
      ),
  });
  const turnStatus = useHeldQuery(
    api.turns.getChatStatus,
    isRouteActive ? { entityId: chatId } : "skip",
  );
  const isExecuting = isChatTurnExecuting({
    status: turnStatus,
    messages,
  });
  const composer = sandboxComposerState({
    isSandboxActive,
    isSwitchingAccount,
    isExecuting,
    isUsageLimitHeld: queueGate.isUsageLimitHeld,
  });
  const turnPorts = useSessionTurnPorts(chatId, accounts);
  const stopChatTurn = useMutation(api.sessions.stopChatTurn);
  const { handleSend, handleCancel, hasPendingReviewComments } = useChatSend({
    ports: turnPorts,
    settings: {
      model,
      effortLevel: displayTraits.effortLevel,
      executionTraits,
      providerAccountId: resolveAccountId(providerAccountId),
    },
    cancel: () => stopChatTurn({ target: { chatId } }),
    draftTarget,
    isExecuting,
    queuesSends: composer.queuesSends,
  });
  const proposedPlans = useHeldQuery(
    api.proposedPlans.listBySession,
    isRouteActive ? { sessionId } : "skip",
  );
  const { implementPlan, implementInNewSession } = useSessionPlanImplementation(
    {
      sessionId,
      chatId,
      handleSend,
      isRouteActive,
    },
  );
  const {
    savePlan,
    saveAsDocument,
    saveAsDocumentLabel,
    isSaving,
    isSavingDoc,
  } = useSessionPlanDocument(sessionId);
  const chatSurface = buildSandboxChatSurface({
    entity: { kind: "session", sessionId, chatId },
    repoId: repo._id,
    model,
    isExecuting,
    isReadOnly,
    doc: {
      backgroundAgents,
      goal: chat.goal,
      providerAccountId: stickyProviderAccountId ?? undefined,
    },
    canSwitchAccount: !isReadOnly && stickyProviderAccountId !== undefined,
    messages,
    accounts,
    resolveAccountId,
    switchProviderAccount: setStickyProviderAccountId,
    isSandboxActive,
    sendCommand: isReadOnly
      ? undefined
      : (command) =>
          handleSend(command, undefined, { skipReviewComments: true }),
  });

  const activeQuestion = useHeldQuery(
    api.pendingQuestions.getActive,
    isRouteActive ? { entityId: chatId } : "skip",
  );
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
  const chatTabs = (
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
  const isWaitingForSlot =
    !isExecuting &&
    queuedMessages.length > 0 &&
    runningChatIds.size >= MAX_PARALLEL_CHATS;

  const { headerLeft, headerRight } = useSessionChatHeader({
    repoId: repo._id,
    session,
    chatId,
    isAnyChatExecuting: runningChatIds.size > 0,
    messageCount: messages.length,
    isSandboxActive,
    isSandboxToggling,
    sandboxGitSync,
    isAssistantResponding: isExecuting,
    model,
    providerAccountId: stickyProviderAccountId,
    usageAccountLabel,
    onSandboxToggle,
    onOpenReviewModal: () =>
      requestConfirm(
        () => setShowReviewModal(true),
        () => {
          void sendForReview().then((ok) => {
            if (ok) toast.success("Sent to the team for review.");
          });
        },
      ),
  });

  const transcriptTail = isWaitingForSlot
    ? `Waiting for a free slot — ${runningChatIds.size} of ${MAX_PARALLEL_CHATS} chats in this session are running.`
    : sandboxStartupTail(startupStreamingActivity, isStartupStreaming);

  const capturedPlans = proposedPlans ?? [];

  const preInputContent = (
    <SandboxChatPreInput
      surface={chatSurface}
      beforeBanner={
        <>
          {!isReadOnly ? (
            <PublishRecoveryBanner
              sessionId={sessionId}
              messages={messages}
              isSandboxActive={isSandboxActive}
            />
          ) : null}
        </>
      }
    />
  );

  const composerChips = (
    <SandboxChatStatusChips surface={chatSurface}>
      {simpleView ? null : (
        <BackgroundProcessesChip
          sessionId={sessionId}
          isRouteActive={isRouteActive}
        />
      )}
    </SandboxChatStatusChips>
  );

  const emptyStateTitle = isSandboxActive
    ? "No messages yet. Start the conversation!"
    : isSandboxStopping
      ? SANDBOX_CHAT_COPY.stoppingTitle
      : isSandboxToggling
        ? SANDBOX_CHAT_COPY.startingTitle
        : SANDBOX_CHAT_COPY.asleepTitle;

  const emptyStateDescription = isSandboxActive
    ? SANDBOX_CHAT_COPY.activeDescription
    : isSandboxToggling
      ?
        ""
      : SANDBOX_CHAT_COPY.asleepDescription;

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
      <SubagentThreadLayer
        surface={chatSurface}
        parentTitle={title}
        messages={transcript}
        streamingActivity={streamingActivity}
        sandboxRunning={isSandboxActive}
        onOpenFile={onOpenFile}
      >
        <ChatBody
          repo={{ id: repo._id, basePath }}
          conversationId={chatId}
          chatParentId={chatId}
          isRouteActive={isRouteActive}
          messages={transcript}
          isLoadingMessages={isLoadingMessages}
          hasOlderHistory={history.hasOlder}
          onLoadOlderHistory={history.loadOlder}
          onReachHistory={history.reach}
          isReachingHistory={history.isReaching}
          queuedMessages={queuedMessages}
          queueLabel={queueGate.queueLabel(isExecuting)}
          streamingActivity={streamingActivity}
          streamingContent={streamingContent}
          streamingPendingQuestion={streamingPendingQuestion}
          blockingQuestion={activeQuestion ?? undefined}
          onAnswerBlockingQuestion={handleAnswerBlockingQuestion}
          isExecuting={isExecuting}
          isInputDisabled={composer.isInputDisabled}
          isArchived={isReadOnly}
          placeholder={composer.placeholder}
          emptyStateTitle={emptyStateTitle}
          emptyStateDescription={emptyStateDescription}
          disabledReason={composer.disabledReason}
          onStartSandbox={
            !isSandboxActive && !isSandboxToggling && !isReadOnly
              ? () => onSandboxToggle("start")
              : undefined
          }
          transcriptTail={transcriptTail}
          underCardLeading={
            <SandboxBranchChip
              branch={sandboxBranch}
              isSandboxActive={isSandboxActive}
              intendedBranch={branchName}
            />
          }
          preInputContent={preInputContent}
          composerChips={composerChips}
          modelPicker={{
            model,
            setModel: queueGate.setModel,
            modelOptions,
            accounts,
            accountId: providerAccountId,
            onAccountChange: queueGate.setAccount,
            displayTraits,
            onTraitsChange,
          }}
          onSend={handleSend}
          onCancel={handleCancel}
          onForkTranscript={handleForkTranscript}
          afterMessage={(messageId) => {
            const plan = proposedPlanForMessage(capturedPlans, messageId);
            if (!plan) return null;
            return (
              <ProposedPlanCard
                planMarkdown={plan.planMarkdown}
                implemented={plan.implementedAt !== undefined}
                onImplement={
                  isReadOnly || plan.implementedAt !== undefined
                    ? undefined
                    : () => implementPlan(plan)
                }
                onImplementInNewSession={
                  isReadOnly || plan.implementedAt !== undefined
                    ? undefined
                    : () => void implementInNewSession(plan.planMarkdown, plan)
                }
                onSave={isReadOnly ? undefined : savePlan}
                onSaveAsDocument={isReadOnly ? undefined : saveAsDocument}
                saveAsDocumentLabel={saveAsDocumentLabel}
                isSaving={isSaving}
                isSavingDoc={isSavingDoc}
                isArchived={isReadOnly}
              />
            );
          }}
          draft={draftBundle}
          isDraftLoading={isDraftLoading}
          onOpenFile={onOpenFile}
          onViewDiff={onViewDiff}
          hasPendingContext={hasPendingReviewComments}
          onOpenAgentsTab={onOpenAgentsTab}
          backgroundAgents={backgroundAgents}
          sandboxRunning={isSandboxActive}
          turnCheckpoint={
            isReadOnly ? undefined : { sessionId, repoId: repo._id }
          }
        />
      </SubagentThreadLayer>
      <SessionReviewModal
        sessionId={sessionId}
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
      />
      {queueGate.switchDialog}
    </ChatPageWrapper>
  );
}
