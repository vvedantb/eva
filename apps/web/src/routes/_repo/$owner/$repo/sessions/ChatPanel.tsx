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
  sandboxComposerState,
  SANDBOX_CHAT_COPY,
} from "@/lib/components/chat/chatBodyUtils";
import { sandboxStartupTail } from "@/lib/components/StreamingActivityDisplay";
import { SandboxChatPreInput } from "@/lib/components/chat/SandboxChatPreInput";
import { useChatQueueGate } from "@/lib/components/chat/useChatQueueGate";
import type { SandboxChatSurface } from "@/lib/components/chat/sandboxChatSurface";
import { BackgroundProcessesPanel } from "./_components/BackgroundProcessesPanel";
import { PublishRecoveryBanner } from "./_components/PublishRecoveryBanner";
import { useSessionChatHeader } from "./_components/SessionChatHeader";
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
  /** Branch the sandbox worktree is on right now, reported by its daemon. */
  sandboxBranch?: string;
  prUrl?: string;
  prState?: "draft" | "open" | "merged" | "closed";
  summary?: string[];
  messages: SessionMessage[];
  queuedMessages: QueuedSessionMessage[];
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
  /** Opens a file (by full sandbox path) in the File Viewer tab. */
  onOpenFile?: (path: string) => void;
  /** Opens the Diffs tab; optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /** Opens the PRD sandbox tab (used by the Plan Ready banner). */
  onOpenPrdTab?: () => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  backgroundAgents?: Doc<"sessions">["backgroundAgents"];
  /**
   * False while this session shell is cached-hidden. Skips chat-local
   * subscriptions that would otherwise keep a background turn warm.
   */
  isRouteActive?: boolean;
}

export function ChatPanel({
  sessionId,
  title,
  branchName,
  sandboxBranch,
  prUrl,
  prState,
  summary,
  messages,
  queuedMessages,
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
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  backgroundAgents,
  isRouteActive = true,
}: ChatPanelProps) {
  const { repo, basePath } = useRepo();
  const navigate = useNavigate();
  const createSession = useMutation(api.sessions.create);
  const simpleView = useSimpleView();
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const altHeld = useAltHeld();
  const { sendForReview } = useSendSessionForReview(sessionId);
  const { startSummary } = useStartSessionSummary(sessionId);

  const defaultModel = normalizeAIModel(repo.defaultModel);
  // The picker lists the session owner's accounts, not the viewer's — the turn
  // always runs on the owner's credentials.
  const { options: accounts, resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId, isRouteActive);
  // Model + traits + account are owned by Convex.
  const {
    model,
    setModel,
    traits,
    setTraits,
    providerAccountId: stickyProviderAccountId,
    setProviderAccountId: setStickyProviderAccountId,
    isSwitchingAccount,
  } = useSessionModel(sessionId, defaultModel, isRouteActive);
  const { displayTraits, executionTraits, onTraitsChange, providerAccountId } =
    useSessionSettings({
      defaultModel,
      model,
      onModelChange: setModel,
      traits,
      onTraitsPersist: setTraits,
      providerAccountId: stickyProviderAccountId,
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
    parentId: sessionId,
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
  const { isExecuting, handleSend, handleCancel } = useSessionSend({
    sessionId,
    model,
    executionTraits,
    reasoningLevel: displayTraits.effortLevel,
    providerAccountId,
    resolveAccountId,
    accounts,
    messages,
    // A running turn queues regardless, so this is `composer.queuesSends`
    // without the `isExecuting` it cannot know before this hook returns.
    queuesSends: !isSandboxActive || queueGate.isUsageLimitHeld,
    isRouteActive,
  });
  const proposedPlans = useHeldQuery(
    api.proposedPlans.listBySession,
    isRouteActive ? { sessionId } : "skip",
  );
  const { implementPlan, implementInNewSession } =
    useSessionPlanImplementation({
      sessionId,
      handleSend,
      isRouteActive,
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
    backgroundAgents,
    usageLimitRecovery: isReadOnly
      ? undefined
      : {
          messages,
          accounts,
          resolveAccountId,
          currentAccountId: stickyProviderAccountId,
          onSwitchAccount: setStickyProviderAccountId,
          isSandboxActive,
        },
    // Review comments are appended to normal sends; a slash command has to
    // reach the harness verbatim.
  };

  const activeQuestion = useHeldQuery(
    api.pendingQuestions.getActive,
    isRouteActive ? { entityId: sessionId } : "skip",
  );
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

  const { headerLeft, headerRight } = useSessionChatHeader({
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
    simpleView,
    model,
    providerAccountId: stickyProviderAccountId,
    usageAccountLabel,
    onSandboxToggle,
    onOpenSummaryModal: () =>
      requestConfirm(
        altHeld,
        () => setShowSummaryModal(true),
        () => {
          void startSummary();
        },
      ),
    onOpenReviewModal: () =>
      requestConfirm(
        altHeld,
        () => setShowReviewModal(true),
        () => {
          void sendForReview().then((ok) => {
            if (ok) toast.success("Sent to the team for review.");
          });
        },
      ),
  });

  const transcriptTail = sandboxStartupTail(
    startupStreamingActivity,
    isStartupStreaming,
  );

  const capturedPlans = proposedPlans ?? [];

  const preInputContent = (
    <SandboxChatPreInput
      surface={chatSurface}
      beforeBanner={
        <>
          {simpleView ? null : (
            <BackgroundProcessesPanel
              sessionId={sessionId}
              isRouteActive={isRouteActive}
            />
          )}
          {!isReadOnly ? (
            <PublishRecoveryBanner
              sessionId={sessionId}
              messages={messages}
              isSandboxActive={isSandboxActive}
            />
          ) : null}
          <PendingReviewCommentChips />
        </>
      }
    />
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
      ? // Waking or sleeping is already the whole story; a second line would
        // only restate the title.
        ""
      : SANDBOX_CHAT_COPY.asleepDescription;

  const composer = sandboxComposerState({
    isSandboxActive,
    isSwitchingAccount,
    isExecuting,
    isUsageLimitHeld: queueGate.isUsageLimitHeld,
  });

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
        repo={{ id: repo._id, basePath }}
        conversationId={sessionId}
        chatParentId={sessionId}
        isRouteActive={isRouteActive}
        messages={messages}
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
        preConversationContent={
          <SessionSummaryAccordion
            summary={summary}
            summaryStreamingActivity={summaryStreamingActivity}
          />
        }
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
          // Only plans captured on a message render in the transcript, so a
          // plan stays where it was proposed. Unanchored plan content (Edit,
          // update_plan, a seeded implementation session) lives in the Plan tab.
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
        isDraftLoading={!draftSeed.isReady}
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
      {queueGate.switchDialog}
    </ChatPageWrapper>
  );
}
