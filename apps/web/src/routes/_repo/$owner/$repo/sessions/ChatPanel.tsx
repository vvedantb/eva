import {
  api,
  normalizeAIModel,
  type Doc,
  type Id,
} from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { ChatPageWrapper } from "@/lib/components/ChatPageWrapper";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { StreamingActivityDisplay } from "@/lib/components/StreamingActivityDisplay";
import { SandboxChatPreInput } from "@/lib/components/chat/SandboxChatPreInput";
import type { SandboxChatSurface } from "@/lib/components/chat/sandboxChatSurface";
import { BackgroundProcessesPanel } from "./_components/BackgroundProcessesPanel";
import { PublishRecoveryBanner } from "./_components/PublishRecoveryBanner";
import { UsageLimitRecoveryBanner } from "./_components/UsageLimitRecoveryBanner";
import { SessionChatHeader } from "./_components/SessionChatHeader";
import { SessionSummaryAccordion } from "./_components/SessionSummaryAccordion";
import {
  SessionSummaryModal,
  useStartSessionSummary,
} from "./_components/SessionSummaryModal";
import {
  SessionReviewModal,
  useSendSessionForReview,
} from "./_components/SessionReviewModal";
import {
  useSessionSend,
  type SessionMessage,
} from "./_components/useSessionSend";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useSessionModel } from "@/lib/hooks/useSessionModel";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  useAvailableAiModels,
  useSessionOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import { PendingReviewCommentChips } from "@/lib/components/chat/PendingReviewCommentChips";
import {
  AveResetChatDialog,
  useResetOrchestratorChat,
} from "@/lib/components/ave/AveResetChatDialog";
import { requestConfirm, useAltHeld } from "@/lib/confirm";
import { toast } from "@eva/ui";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { getSessionReadOnlyMessage } from "./_utils/sessionReadOnly";
import { ProposedPlanCard } from "./_components/ProposedPlanCard";
import { proposedPlanForMessage } from "./_components/proposedPlanLogic";
import { useSessionPlanImplementation } from "./_components/useSessionPlanImplementation";
import { useSessionPlanDocument } from "./_components/useSessionPlanDocument";

type QueuedSessionMessage = NonNullable<
  FunctionReturnType<typeof api.queuedMessages.listByParent>
>[number];

interface ChatPanelProps {
  sessionId: Id<"sessions">;
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
  backgroundAgents?: Doc<"sessions">["backgroundAgents"];
}

export function ChatPanel({
  sessionId,
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
  permalinkPath,
  chatOnly,
  hideTitle = false,
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  backgroundAgents,
}: ChatPanelProps) {
  const { repo, basePath } = useRepo();
  const simpleView = useSimpleView();
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showResetChatDialog, setShowResetChatDialog] = useState(false);
  const altHeld = useAltHeld();
  const { sendForReview } = useSendSessionForReview(sessionId);
  const { startSummary } = useStartSessionSummary(sessionId);
  const { reset: resetOrchestratorChat } = useResetOrchestratorChat();

  const defaultModel = normalizeAIModel(repo.defaultModel);
  // The picker lists the session owner's accounts, not the viewer's — the turn
  // always runs on the owner's credentials.
  const { options: accounts, resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId);
  // Model + traits + account are owned by Convex.
  const {
    model,
    setModel,
    traits,
    setTraits,
    providerAccountId: stickyProviderAccountId,
    setProviderAccountId: setStickyProviderAccountId,
    isSwitchingAccount,
  } = useSessionModel(sessionId, defaultModel);
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
      void setStickyProviderAccountId(
        next === null ? null : (resolveAccountId(next) ?? null),
      );
    },
  });
  // Every visible model, across providers: a session may be moved onto another
  // provider mid-conversation, and each pick carries the account it was made
  // under so credentials follow the new provider.
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);

  const draftTarget = { kind: "sessionChat" as const, sessionId };
  const draftSeed = useChatDraftSeed(draftTarget);
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

  const { isExecuting, handleSend, handleCancel } = useSessionSend({
    sessionId,
    model,
    executionTraits,
    reasoningLevel: displayTraits.effortLevel,
    providerAccountId,
    resolveAccountId,
    accounts,
    messages,
  });
  const proposedPlans = useQuery(api.proposedPlans.listBySession, {
    sessionId,
  });
  const { implementPlan, implementPlanContent, implementInNewSession } =
    useSessionPlanImplementation({
      sessionId,
      handleSend,
    });
  const {
    savePlan,
    saveAsDocument,
    saveAsDocumentLabel,
    isSaving,
    isSavingDoc,
  } = useSessionPlanDocument(sessionId);
  const chatSurface: SandboxChatSurface = {
    entity: { kind: "session", sessionId },
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
    entityId: sessionId,
  });
  const answerPendingQuestion = useMutation(api.pendingQuestions.answer);
  const handleAnswerBlockingQuestion = async (
    toolUseId: string,
    answers: Record<string, string>,
  ) => {
    await catchMutationError(
      answerPendingQuestion({
        entityId: sessionId,
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

  const { headerLeft, headerRight } = SessionChatHeader({
    repoId: repo._id,
    sessionId,
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
    onOpenSummaryModal: () =>
      requestConfirm(altHeld, () => setShowSummaryModal(true), () => {
        void startSummary();
      }),
    onOpenReviewModal: () =>
      requestConfirm(altHeld, () => setShowReviewModal(true), () => {
        void sendForReview().then((ok) => {
          if (ok) toast.success("Sent to the team for review.");
        });
      }),
    // Only Manager Ave can be reset: it is the one chat the user cannot simply
    // replace by opening a new session.
    onOpenResetChatDialog: chatOnly
      ? () =>
          requestConfirm(
            altHeld,
            () => setShowResetChatDialog(true),
            () => {
              void resetOrchestratorChat();
            },
          )
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

  const beforeQueuedContent = isStartupStreaming ? startupStreamingNode : null;

  const capturedPlans = proposedPlans ?? [];
  const lastAssistantMessageId = [...messages]
    .toReversed()
    .find(
      (message) => message.role === "assistant" && message.isSystemAlert !== true,
    )?._id;
  const planContentMarkdown =
    typeof planContent === "string" && planContent.trim().length > 0
      ? planContent
      : null;
  const planContentAlreadyInChat =
    planContentMarkdown !== null &&
    capturedPlans.some(
      (plan) => plan.planMarkdown.trim() === planContentMarkdown.trim(),
    );

  const preInputContent = (
    <SandboxChatPreInput
      surface={chatSurface}
      beforeBanner={
        <>
          {simpleView ? null : (
            <BackgroundProcessesPanel sessionId={sessionId} />
          )}
          {!isReadOnly ? (
            <>
              <PublishRecoveryBanner
                sessionId={sessionId}
                messages={messages}
                isSandboxActive={isSandboxActive}
              />
              <UsageLimitRecoveryBanner
                sessionId={sessionId}
                messages={messages}
                model={model}
                accounts={accounts}
                resolveAccountId={resolveAccountId}
                currentAccountId={stickyProviderAccountId}
                onSwitchAccount={setStickyProviderAccountId}
                isSandboxActive={isSandboxActive}
                isExecuting={isExecuting}
              />
            </>
          ) : null}
          <PendingReviewCommentChips />
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
    >
      <ChatBody
        repoId={repo._id}
        repoBasePath={basePath}
        conversationId={sessionId}
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
        afterMessage={(messageId) => {
          const plan = proposedPlanForMessage(capturedPlans, messageId);
          if (plan) {
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
          }
          if (
            planContentMarkdown &&
            !planContentAlreadyInChat &&
            messageId === lastAssistantMessageId
          ) {
            return (
              <ProposedPlanCard
                planMarkdown={planContentMarkdown}
                implemented={false}
                onImplement={
                  isReadOnly
                    ? undefined
                    : () => implementPlanContent(planContentMarkdown)
                }
                onImplementInNewSession={
                  isReadOnly
                    ? undefined
                    : () => void implementInNewSession(planContentMarkdown)
                }
                onSave={isReadOnly ? undefined : savePlan}
                onSaveAsDocument={isReadOnly ? undefined : saveAsDocument}
                saveAsDocumentLabel={saveAsDocumentLabel}
                isSaving={isSaving}
                isSavingDoc={isSavingDoc}
                isArchived={isReadOnly}
              />
            );
          }
          return null;
        }}
        draft={draftBundle}
        isDraftLoading={!draftSeed.isReady}
        onOpenFile={onOpenFile}
        onViewDiff={prUrl ? onViewDiff : undefined}
        hasPendingContext={hasPendingReviewComments}
        onOpenAgentsTab={onOpenAgentsTab}
        backgroundAgents={backgroundAgents}
        sandboxRunning={isSandboxActive}
        turnCheckpoint={
          isReadOnly ? undefined : { sessionId, repoId: repo._id }
        }
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
