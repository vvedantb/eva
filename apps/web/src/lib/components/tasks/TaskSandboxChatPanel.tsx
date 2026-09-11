"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  DEFAULT_AI_MODEL,
  normalizeAIModel,
  resolveTraitsForDisplay,
  type AIModel,
  type Id,
  type ReasoningLevel,
  type StoredModelTraits,
} from "@eva/backend";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { isAssistantTurnInProgress } from "@/lib/components/chat/chatBodyUtils";
import {
  buildFirstRunChatTurn,
  findFirstRunChatTurnRun,
} from "@/lib/components/tasks/firstRunChatTurn";
import { useChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import { SandboxChatHeaderActions } from "@/lib/components/sandbox/SandboxStartStopButton";
import { SandboxChatPreInput } from "@/lib/components/chat/SandboxChatPreInput";
import type { SandboxChatSurface } from "@/lib/components/chat/sandboxChatSurface";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAvailableAiModels,
  useTaskOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useProviderAccountHandoff } from "@/lib/hooks/useProviderAccountHandoff";

interface TaskSandboxChatPanelProps {
  taskId: Id<"agentTasks">;
  isSandboxActive: boolean;
  isSandboxToggling?: boolean;
  /** Opens the Files tab and loads this sandbox path in the file viewer. */
  onOpenFile?: (path: string) => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  onSandboxToggle?: (action: "start" | "stop") => void;
}

export function TaskSandboxChatPanel({
  taskId,
  isSandboxActive,
  isSandboxToggling = false,
  onOpenFile,
  onOpenAgentsTab,
  onSandboxToggle,
}: TaskSandboxChatPanelProps) {
  const { repo, basePath } = useRepo();
  const task = useQuery(api.agentTasks.get, { id: taskId });
  const messages = useQuery(api.messages.listByParent, { parentId: taskId });
  const queuedMessages = useQuery(api.queuedMessages.listByParent, {
    parentId: taskId,
  });
  const streaming = useQuery(api.streaming.get, {
    entityId: `task-chat-${taskId}`,
  });

  // Quick tasks open the chat with the first run rendered as a normal turn:
  // the task prompt as the user message, the run's activity log + summary as
  // the assistant reply. The detail timeline hides that same run (see
  // firstRunChatTurn.ts).
  const isQuickTask = task != null && task.projectId === undefined;
  const runs = useQuery(
    api.agentRuns.listByTask,
    isQuickTask ? { taskId } : "skip",
  );
  const firstRun = findFirstRunChatTurnRun(runs);
  const firstRunActivityLog = useQuery(
    api.agentRuns.getActivityLog,
    firstRun ? { id: firstRun._id } : "skip",
  );
  const taskAttachments = useQuery(
    api.agentTasks.listAttachments,
    firstRun && (task?.attachmentStorageIds?.length ?? 0) > 0
      ? { taskId }
      : "skip",
  );
  const firstRunTurn =
    task && firstRun && firstRunActivityLog !== undefined
      ? buildFirstRunChatTurn({
          task,
          run: firstRun,
          activityLog: firstRunActivityLog,
          ...(taskAttachments !== undefined
            ? { attachments: taskAttachments }
            : {}),
        })
      : [];

  const addMessage = useMutation(api.agentTaskChatWorkflow.addMessage);
  const startExecute = useMutation(api.agentTaskChatWorkflow.startExecute);
  const enqueueMessage = useMutation(api.agentTaskChatWorkflow.enqueueMessage);
  const cancelExecution = useMutation(
    api.agentTaskChatWorkflow.cancelExecution,
  );
  const updateTask = useMutation(api.agentTasks.update);
  const prewarmChatDaemonNow = useAction(
    api.agentTaskChatWorkflow.prewarmChatDaemonNow,
  );
  const { isSwitchingAccount, switchProviderAccount } =
    useProviderAccountHandoff({
      persist: (providerAccountId) =>
        updateTask({ id: taskId, providerAccountId }),
      prewarm: () => prewarmChatDaemonNow({ taskId }),
    });
  const setTraitsMutation = useMutation(
    api.agentTasks.setTraits,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.agentTasks.get, { id: args.id });
    if (!current) return;
    localStore.setQuery(
      api.agentTasks.get,
      { id: args.id },
      {
        ...current,
        ...(args.reasoningLevel !== undefined
          ? { lastReasoningLevel: args.reasoningLevel }
          : {}),
        ...(args.thinkingEnabled !== undefined
          ? { lastThinkingEnabled: args.thinkingEnabled }
          : {}),
        ...(args.use1mContext !== undefined
          ? { lastUse1mContext: args.use1mContext }
          : {}),
        ...(args.fastMode !== undefined ? { lastFastMode: args.fastMode } : {}),
      },
    );
  });

  // Model + account stay on the task doc (shared with activity composer).
  // Traits are sticky on Convex like sessions (no localStorage).
  const model = normalizeAIModel(
    task?.model ?? repo.defaultModel ?? DEFAULT_AI_MODEL,
  );
  const storedTraits: StoredModelTraits = {
    effortLevel: task?.lastReasoningLevel,
    thinkingEnabled: task?.lastThinkingEnabled,
    use1mContext: task?.lastUse1mContext,
    fastMode: task?.lastFastMode,
  };
  const displayTraits = resolveTraitsForDisplay(model, storedTraits);
  const executionTraits = buildTraitsExecutionPayload(model, storedTraits);
  const providerAccountId = task?.providerAccountId ?? null;
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);
  const { options: accounts, resolveId: resolveAccountId } =
    useTaskOwnerProviderAccounts(taskId);
  const currentUserId = useQuery(api.auth.me);
  const isOwner =
    currentUserId !== undefined &&
    task?.createdBy !== undefined &&
    currentUserId === task.createdBy;
  const usageAccountLabel =
    providerAccountId === null
      ? "Team"
      : (accounts.find((account) => account.id === providerAccountId)?.label ??
        "Selected account");

  const draftSeed = useChatDraftSeed({
    kind: "taskChat" as const,
    taskId,
  });
  const draftBundle = draftSeed.isReady
    ? {
        target: { kind: "taskChat" as const, taskId },
        initialDisplay: draftSeed.initialDisplay,
        mentionMap: draftSeed.mentionMap,
        skillMap: draftSeed.skillMap,
      }
    : undefined;

  // Same entityId the task-chat sandbox posts with (task id, not stream prefix).
  const activeQuestion = useQuery(api.pendingQuestions.getActive, {
    entityId: taskId,
  });
  const answerPendingQuestion = useMutation(api.pendingQuestions.answer);
  const handleAnswerBlockingQuestion = async (
    toolUseId: string,
    answers: Record<string, string>,
  ) => {
    await answerPendingQuestion({
      entityId: taskId,
      toolUseId,
      answer: JSON.stringify(answers),
    });
  };

  const setModel = (next: AIModel) => {
    void updateTask({ id: taskId, model: normalizeAIModel(next) });
  };

  const onTraitsChange = (partial: Partial<StoredModelTraits>) => {
    const reasoningLevel: ReasoningLevel | undefined = partial.effortLevel;
    void setTraitsMutation({
      id: taskId,
      ...(reasoningLevel !== undefined ? { reasoningLevel } : {}),
      ...(partial.thinkingEnabled !== undefined
        ? { thinkingEnabled: partial.thinkingEnabled }
        : {}),
      ...(partial.use1mContext !== undefined
        ? { use1mContext: partial.use1mContext }
        : {}),
      ...(partial.fastMode !== undefined ? { fastMode: partial.fastMode } : {}),
    });
  };

  const setProviderAccountId = (next: string | null) => {
    if (!isOwner || !task) return;
    switchProviderAccount(resolveAccountId(next) ?? null);
  };

  // Server flag first; the message-shape fallback is the shared helper so a
  // finished-but-empty bubble or a trailing system alert cannot pin the
  // composer in "working" mode (same rule as useSessionSend).
  const isExecuting =
    Boolean(task?.activeChatWorkflowId) ||
    isAssistantTurnInProgress(messages ?? []);

  const handleSend = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => {
    if (isExecuting) {
      await enqueueMessage({
        taskId,
        message: content,
        model,
        ...executionTraits,
        reasoningLevel:
          displayTraits.effortLevel ?? executionTraits.reasoningLevel,
        providerAccountId: resolveAccountId(providerAccountId),
        attachmentStorageIds,
      });
      return;
    }
    const accountId = resolveAccountId(providerAccountId);
    try {
      await addMessage({
        taskId,
        content,
        attachmentStorageIds,
        providerAccountId: accountId,
        model,
        reasoningLevel: displayTraits.effortLevel,
      });
      await startExecute({
        taskId,
        message: content,
        model,
        ...executionTraits,
        providerAccountId: accountId,
      });
    } catch (error) {
      // Surface the failure in chat — a thrown startExecute rolls back the
      // whole turn (no placeholder, no workflow), so without this the send
      // silently vanishes (same contract as useSessionSend).
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      await addMessage({
        taskId,
        role: "assistant",
        content: `Error: ${errorMessage}`,
      });
    }
  };

  const handleCancel = async () => {
    await cancelExecution({ taskId });
  };

  const chatSurface: SandboxChatSurface = {
    entity: { kind: "task", taskId },
    repoId: repo._id,
    model,
    isExecuting,
    isReadOnly: false,
    // A stopped sandbox cannot run `/compact`, so it counts as read-only here.
    compactionReadOnly: !isSandboxActive,
    backgroundAgents: task?.backgroundAgents,
    // Owner-only, like the account picker: task chat is owner-sticky.
    usageLimitRecovery:
      isOwner && task
        ? {
            messages: messages ?? [],
            accounts,
            resolveAccountId,
            currentAccountId: task.providerAccountId ?? null,
            onSwitchAccount: switchProviderAccount,
            isSandboxActive,
          }
        : undefined,
    // No review-comment append on this send path (sessions-only), so a slash
    // command already reaches the harness verbatim.
    onSendCommand: (command) => {
      void handleSend(command);
    },
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <SandboxChatHeaderActions
        repoId={repo._id}
        isSandboxActive={isSandboxActive}
        isSandboxToggling={isSandboxToggling}
        onSandboxToggle={onSandboxToggle}
        isAssistantResponding={isExecuting}
        model={model}
        providerAccountId={providerAccountId}
        usageAccountLabel={usageAccountLabel}
      />
      <ChatBody
        repoId={repo._id}
        repoBasePath={basePath}
        conversationId={taskId}
        messages={[...firstRunTurn, ...(messages ?? [])]}
        queuedMessages={queuedMessages ?? []}
        streamingActivity={streaming?.currentActivity}
        streamingContent={streaming?.currentContent}
        streamingPendingQuestion={streaming?.pendingQuestion}
        blockingQuestion={activeQuestion ?? undefined}
        onAnswerBlockingQuestion={handleAnswerBlockingQuestion}
        isExecuting={isExecuting}
        isInputDisabled={!isSandboxActive || isSwitchingAccount}
        placeholder={
          !isSandboxActive
            ? "Wake Eva up to chat..."
            : isSwitchingAccount
              ? "Switching Claude account..."
              : "Ask Eva anything... / for skills · @ to mention"
        }
        emptyStateTitle={
          isSandboxActive
            ? "Ask Eva anything about this task's running sandbox."
            : "Wake Eva up to begin chatting."
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
        preInputContent={<SandboxChatPreInput surface={chatSurface} />}
        draft={draftBundle}
        isDraftLoading={!draftSeed.isReady}
        onOpenFile={onOpenFile}
        onOpenAgentsTab={onOpenAgentsTab}
        backgroundAgents={task?.backgroundAgents}
        sandboxRunning={isSandboxActive}
      />
    </div>
  );
}
