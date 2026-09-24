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
  type StoredModelTraits,
} from "@eva/backend";
import { composerTraitFields, storedComposerTraits } from "@eva/shared";
import { toast } from "@eva/ui";
import { toRunTraitArgs } from "@/lib/utils/runTraits";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { SandboxBranchChip } from "@/lib/components/chat/SandboxBranchChip";
import {
  isAssistantTurnInProgress,
  readableSendError,
  sandboxComposerState,
  SANDBOX_CHAT_COPY,
} from "@/lib/components/chat/chatBodyUtils";
import {
  buildFirstRunChatTurn,
  findFirstRunChatTurnRun,
  isRunInProgress,
  taskRunStreamingEntityId,
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
  /** Opens Review diffs; optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  onSandboxToggle?: (action: "start" | "stop") => void;
}

export function TaskSandboxChatPanel({
  taskId,
  isSandboxActive,
  isSandboxToggling = false,
  onOpenFile,
  onViewDiff,
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
  // the assistant reply. From the moment the run starts, so its steps stream
  // here rather than into a timeline accordion on the task page (see
  // firstRunChatTurn.ts).
  const isQuickTask = task != null && task.projectId === undefined;
  const runs = useQuery(
    api.agentRuns.listByTask,
    isQuickTask ? { taskId } : "skip",
  );
  const firstRun = findFirstRunChatTurnRun(runs);
  const isFirstRunInProgress =
    firstRun !== undefined && isRunInProgress(firstRun.status);
  // The log row is only written when the run completes, so an in-flight run
  // reads its live activity off the streaming row instead.
  const firstRunActivityLog = useQuery(
    api.agentRuns.getActivityLog,
    firstRun && !isFirstRunInProgress ? { id: firstRun._id } : "skip",
  );
  const firstRunStreaming = useQuery(
    api.streaming.get,
    firstRun && isFirstRunInProgress
      ? { entityId: taskRunStreamingEntityId(firstRun._id) }
      : "skip",
  );
  const taskAttachments = useQuery(
    api.agentTasks.listAttachments,
    firstRun && (task?.attachmentStorageIds?.length ?? 0) > 0
      ? { taskId }
      : "skip",
  );
  const firstRunTurn =
    task &&
    firstRun &&
    (isFirstRunInProgress || firstRunActivityLog !== undefined)
      ? buildFirstRunChatTurn({
          task,
          run: firstRun,
          activityLog: firstRunActivityLog ?? null,
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
  // The first run is its own workflow, not a chat turn, so Stop has to reach
  // the task workflow while it owns the bubble.
  const cancelFirstRun = useMutation(api.taskWorkflow.cancelExecution);
  const updateTask = useMutation(api.agentTasks.update);
  const setDraft = useMutation(api.drafts.set);
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
        ...composerTraitFields(args),
      },
    );
  });

  // Model + account stay on the task doc (shared with activity composer).
  // Traits are sticky on Convex like sessions (no localStorage).
  const model = normalizeAIModel(
    task?.model ?? repo.defaultModel ?? DEFAULT_AI_MODEL,
  );
  const storedTraits: StoredModelTraits = storedComposerTraits(task);
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
    void setTraitsMutation({
      id: taskId,
      ...toRunTraitArgs(partial),
    });
  };

  const setProviderAccountId = (next: string | null) => {
    if (!isOwner || !task) return;
    switchProviderAccount(resolveAccountId(next) ?? null);
  };

  // Server flag first; the message-shape fallback is the shared helper so a
  // finished-but-empty bubble or a trailing system alert cannot pin the
  // composer in "working" mode (same rule as useSessionSend). The first run
  // counts too: its bubble is on screen here, so the composer shows Working
  // and Stop for it like any other turn.
  const isExecuting =
    isFirstRunInProgress ||
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
      // A thrown startExecute rolls the whole turn back (no placeholder, no
      // workflow) and the composer has already cleared, so the prompt only
      // exists here. The toast owns the failure and hands the text back through
      // the same `drafts` row the composer reads (same contract as
      // useSessionSend).
      toast.error("Couldn't send your message", {
        id: "task-chat-send",
        description: readableSendError(
          error instanceof Error ? error.message : "",
        ),
        action: {
          label: "Restore draft",
          onClick: () => {
            void setDraft({ target: { kind: "taskChat", taskId }, content });
          },
        },
      });
    }
  };

  const composer = sandboxComposerState({
    isSandboxActive,
    isSwitchingAccount,
    isExecuting,
  });

  const handleCancel = async () => {
    if (isFirstRunInProgress) {
      await cancelFirstRun({ taskId });
      return;
    }
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
        model={model}
        providerAccountId={providerAccountId}
        usageAccountLabel={usageAccountLabel}
      />
      <ChatBody
        repoId={repo._id}
        repoBasePath={basePath}
        conversationId={taskId}
        chatParentId={taskId}
        messages={[...firstRunTurn, ...(messages ?? [])]}
        isLoadingMessages={messages === undefined}
        queuedMessages={queuedMessages ?? []}
        streamingActivity={
          isFirstRunInProgress
            ? firstRunStreaming?.currentActivity
            : streaming?.currentActivity
        }
        streamingContent={
          isFirstRunInProgress
            ? firstRunStreaming?.currentContent
            : streaming?.currentContent
        }
        streamingPendingQuestion={
          isFirstRunInProgress
            ? firstRunStreaming?.pendingQuestion
            : streaming?.pendingQuestion
        }
        blockingQuestion={activeQuestion ?? undefined}
        onAnswerBlockingQuestion={handleAnswerBlockingQuestion}
        isExecuting={isExecuting}
        isInputDisabled={composer.isInputDisabled}
        placeholder={composer.placeholder}
        emptyStateTitle={
          isSandboxActive
            ? "Ask Eva anything about this task's running sandbox."
            : SANDBOX_CHAT_COPY.asleepTitle
        }
        emptyStateDescription={
          isSandboxActive
            ? SANDBOX_CHAT_COPY.activeDescription
            : SANDBOX_CHAT_COPY.asleepDescription
        }
        disabledReason={composer.disabledReason}
        onStartSandbox={
          !isSandboxActive && !isSandboxToggling && onSandboxToggle
            ? () => onSandboxToggle("start")
            : undefined
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
        underCardLeading={
          <SandboxBranchChip
            branch={task?.sandboxBranch}
            isSandboxActive={isSandboxActive}
          />
        }
        draft={draftBundle}
        isDraftLoading={!draftSeed.isReady}
        onOpenFile={onOpenFile}
        onViewDiff={onViewDiff}
        onOpenAgentsTab={onOpenAgentsTab}
        backgroundAgents={task?.backgroundAgents}
        sandboxRunning={isSandboxActive}
      />
    </div>
  );
}
