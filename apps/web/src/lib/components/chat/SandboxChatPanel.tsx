"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { sandboxComposerState, SANDBOX_CHAT_COPY } from "@eva/shared";
import { sandboxStartupTail } from "@/lib/components/StreamingActivityDisplay";
import { SandboxChatHeaderActions } from "@/lib/components/sandbox/SandboxStartStopButton";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useOlderTranscript } from "@/lib/hooks/useChatTranscript";
import { useProviderAccountHandoff } from "@/lib/hooks/useProviderAccountHandoff";
import { ChatBody } from "./ChatBody";
import { SandboxBranchChip } from "./SandboxBranchChip";
import {
  sandboxTurnSettings,
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
import { useChatQueueGate } from "./useChatQueueGate";
import { useChatSend } from "./useChatSend";
import { useSandboxChatDraft } from "./useSandboxChatDraft";

/** What the page around a task or project sandbox chat hands it. */
export interface SandboxChatPanelProps {
  isSandboxActive: boolean;
  isSandboxToggling?: boolean;
  /** Startup steps while the preview sandbox wakes; undefined otherwise. */
  sandboxStartupActivity?: string;
  /** Opens the Files tab and loads this sandbox path in the file viewer. */
  onOpenFile?: (path: string) => void;
  /** Opens Review diffs; optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  onSandboxToggle?: (action: "start" | "stop") => void;
}

/**
 * The sandbox chat for a quick task or a project. The entity only supplies a
 * binding; the transcript, send rule, failure toast, queue gate, account
 * handoff and blocking question are the same for both.
 */
export function SandboxChatPanel({
  binding,
  isSandboxActive,
  isSandboxToggling = false,
  sandboxStartupActivity,
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  onSandboxToggle,
}: SandboxChatPanelProps & { binding: SandboxChatBinding }) {
  const { repo, basePath } = useRepo();
  const { entity, doc, model, firstRun } = binding;
  const { parentId, streamingEntityId, draftTarget } = sandboxChatKeys(entity);
  const { messages, isExecuting } = useSandboxChatTranscript(binding);
  // `messages` is the live part; the rendered transcript adds the history
  // above it once the reader goes there.
  const history = useOlderTranscript({
    parentId,
    live: messages,
    active: true,
  });
  const queuedMessages = useQuery(api.queuedMessages.listByParent, {
    parentId,
  });
  const chatStreaming = useQuery(api.streaming.get, {
    entityId: streamingEntityId,
  });
  // The first run streams to its own row while it owns the bubble.
  const streaming = firstRun?.isInProgress ? firstRun.streaming : chatStreaming;
  // Same entityId the sandbox posts with (the entity id, not the stream key).
  const blockingQuestion = useQuery(api.pendingQuestions.getActive, {
    entityId: parentId,
  });
  const answerPendingQuestion = useMutation(api.pendingQuestions.answer);
  const { draftBundle, isDraftLoading } = useSandboxChatDraft(draftTarget);
  const { isSwitchingAccount, switchProviderAccount } =
    useProviderAccountHandoff({
      persist: binding.persistAccount,
      prewarm: binding.prewarm,
    });

  const setProviderAccountId = async (next: string | null) => {
    if (!binding.isOwner) return;
    await switchProviderAccount(binding.resolveAccountId(next) ?? null);
  };

  const queueGate = useChatQueueGate({
    parentId,
    messages: messages ?? [],
    queuedMessages: queuedMessages ?? [],
    model,
    accountId: binding.providerAccountId,
    accounts: binding.pickerAccounts,
    resolveAccountId: binding.resolveAccountId,
    isSandboxActive,
    setModel: binding.setModel,
    setAccount: setProviderAccountId,
  });
  const composer = sandboxComposerState({
    isSandboxActive,
    isSwitchingAccount,
    isExecuting,
    isUsageLimitHeld: queueGate.isUsageLimitHeld,
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
    await answerPendingQuestion({
      entityId: parentId,
      toolUseId,
      answer: JSON.stringify(answers),
    });
  };

  // `accounts`, not `pickerAccounts`: the synthetic owner row exists only for
  // non-owners, who never see the usage-limit recovery card.
  const chatSurface = buildSandboxChatSurface({
    entity,
    repoId: repo._id,
    model,
    isExecuting,
    doc,
    canSwitchAccount: binding.isOwner,
    messages,
    accounts: binding.accounts,
    resolveAccountId: binding.resolveAccountId,
    switchProviderAccount,
    isSandboxActive,
    sendCommand: (command) =>
      handleSend(command, undefined, { skipReviewComments: true }),
  });

  // The first run opens the chat, so it shows once nothing older is left.
  const chatMessages = [
    ...(history.hasOlder ? [] : (firstRun?.turn ?? [])),
    ...(history.messages ?? []),
  ];
  const usageAccountLabel =
    binding.providerAccountId === null
      ? "Team"
      : (binding.pickerAccounts.find(
          (account) => account.id === binding.providerAccountId,
        )?.label ?? "Selected account");

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <SandboxChatHeaderActions
        repoId={repo._id}
        model={model}
        providerAccountId={binding.providerAccountId}
        usageAccountLabel={usageAccountLabel}
      />
      <SubagentThreadLayer
        surface={chatSurface}
        parentTitle={
          doc?.title ?? (entity.kind === "task" ? "Task" : "Project")
        }
        messages={chatMessages}
        streamingActivity={streaming?.currentActivity}
        sandboxRunning={isSandboxActive}
        onOpenFile={onOpenFile}
      >
        <ChatBody
          repo={{ id: repo._id, basePath }}
          conversationId={parentId}
          chatParentId={parentId}
          messages={chatMessages}
          isLoadingMessages={messages === undefined}
          hasOlderHistory={history.hasOlder}
          onLoadOlderHistory={history.loadOlder}
          onReachHistory={history.reach}
          isReachingHistory={history.isReaching}
          queuedMessages={queuedMessages ?? []}
          queueLabel={queueGate.queueLabel(isExecuting)}
          streamingActivity={streaming?.currentActivity}
          streamingContent={streaming?.currentContent}
          streamingPendingQuestion={streaming?.pendingQuestion}
          blockingQuestion={blockingQuestion ?? undefined}
          onAnswerBlockingQuestion={handleAnswerBlockingQuestion}
          isExecuting={isExecuting}
          isInputDisabled={composer.isInputDisabled}
          placeholder={composer.placeholder}
          emptyStateTitle={
            isSandboxActive
              ? `Ask Eva anything about this ${entity.kind}'s running sandbox.`
              : SANDBOX_CHAT_COPY.asleepTitle
          }
          emptyStateDescription={
            isSandboxActive
              ? SANDBOX_CHAT_COPY.activeDescription
              : SANDBOX_CHAT_COPY.asleepDescription
          }
          disabledReason={composer.disabledReason}
          onStartSandbox={startSandboxHandler(
            isSandboxActive,
            isSandboxToggling,
            onSandboxToggle,
          )}
          modelPicker={{
            model,
            setModel: queueGate.setModel,
            modelOptions: binding.modelOptions,
            accounts: binding.pickerAccounts,
            accountId: binding.providerAccountId,
            onAccountChange: queueGate.setAccount,
            displayTraits: binding.displayTraits,
            onTraitsChange: binding.onTraitsChange,
          }}
          onSend={handleSend}
          onCancel={handleCancel}
          preInputContent={<SandboxChatPreInput surface={chatSurface} />}
          composerChips={<SandboxChatStatusChips surface={chatSurface} />}
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
          backgroundAgents={doc?.backgroundAgents}
          sandboxRunning={isSandboxActive}
          transcriptTail={sandboxStartupTail(
            sandboxStartupActivity,
            sandboxStartupActivity !== undefined &&
              !isSandboxActive &&
              !isExecuting,
          )}
        />
      </SubagentThreadLayer>
      {queueGate.switchDialog}
    </div>
  );
}
