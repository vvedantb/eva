"use client";

import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  DEFAULT_AI_MODEL,
  normalizeAIModel,
  resolveTraitsForDisplay,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import {
  composerTraitFields,
  storedComposerTraits,
  toRunTraitArgs,
} from "@eva/shared";
import { openChatTurnOptimistically } from "@/lib/components/chat/useChatTurnOpen";
import { insertSentTurnOptimistically } from "@/lib/components/chat/useChatSend";
import {
  SandboxChatPanel,
  type SandboxChatPanelProps,
} from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import {
  buildFirstRunChatTurn,
  findFirstRunChatTurnRun,
  isRunInProgress,
  taskRunStreamingEntityId,
} from "@/lib/components/tasks/firstRunChatTurn";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAvailableAiModels,
  useTaskOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useChatModel } from "@/lib/hooks/useChatModel";
import { useSessionTurnPorts } from "@/routes/_repo/$owner/$repo/sessions/_components/useSessionTurnPorts";
import { useTaskSession, type TaskSession } from "./useTaskSession";

type TaskChatTask = FunctionReturnType<typeof api.agentTasks.get> | undefined;
type TaskChatRun =
  | FunctionReturnType<typeof api.agentRuns.listByTask>[number]
  | undefined;

export function TaskSandboxChatPanel({
  taskId,
  ...panel
}: SandboxChatPanelProps & { taskId: Id<"agentTasks"> }) {
  const binding = useTaskChatBinding(taskId);
  return <SandboxChatPanel binding={binding} {...panel} />;
}

/**
 * The task side of the sandbox chat. A quick task chats in its owned session's
 * Main chat, whose own sticky model, traits and account drive the composer;
 * its first run shows as the opening turn. A project task keeps its task-row
 * chat. Both variants bind their hooks up front; hooks cannot be conditional.
 */
export function useTaskChatBinding(
  taskId: Id<"agentTasks">,
): SandboxChatBinding {
  const task = useQuery(api.agentTasks.get, { id: taskId });
  const taskSession = useTaskSession(taskId, task);
  const firstRun = useTaskFirstRunChatTurn(taskId, task);
  const accounts = useTaskOwnerProviderAccounts(taskId);
  const currentUserId = useQuery(api.auth.me);
  const isOwner =
    currentUserId !== undefined &&
    task?.createdBy !== undefined &&
    currentUserId === task.createdBy;
  const common = {
    firstRun,
    accounts: accounts.options,
    pickerAccounts: accounts.options,
    resolveAccountId: accounts.resolveId,
    isOwner,
  };
  const sessionBinding = useTaskSessionChatBinding({
    taskId,
    task,
    taskSession,
    common,
  });
  const rowBinding = useTaskRowChatBinding({ taskId, task, common });
  return taskSession.isQuickTask ? sessionBinding : rowBinding;
}

type BindingCommon = Pick<
  SandboxChatBinding,
  "accounts" | "pickerAccounts" | "resolveAccountId" | "isOwner"
> & { firstRun: NonNullable<SandboxChatBinding["firstRun"]> };

/** A quick task: its owned session's Main chat (created on first need). */
function useTaskSessionChatBinding({
  taskId,
  task,
  taskSession,
  common,
}: {
  taskId: Id<"agentTasks">;
  task: TaskChatTask;
  taskSession: TaskSession;
  common: BindingCommon;
}): SandboxChatBinding {
  const { repo } = useRepo();
  const { owned, session, chatSource } = taskSession;
  // Before the session exists, the same seed `ensureOwned` gives its chat.
  const chatModel = useChatModel(
    chatSource,
    normalizeAIModel(
      task?.lastChatModel ?? task?.model ?? repo.defaultModel ?? DEFAULT_AI_MODEL,
    ),
  );
  const ports = useSessionTurnPorts(chatSource, common.accounts);
  const cancelChat = useMutation(api.sessionWorkflow.cancelExecution);
  // The first run is its own workflow, not a chat turn, so Stop has to reach
  // the task workflow while it owns the bubble.
  const cancelFirstRun = useMutation(api.taskWorkflow.cancelExecution);
  const { model, chat } = chatModel;
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);

  return {
    ...common,
    // No session yet means no transcript yet: the task keys read empty.
    entity: owned
      ? { kind: "session", sessionId: owned.sessionId, chatId: owned.chatId }
      : { kind: "task", taskId },
    doc: task && {
      title: task.title,
      sandboxBranch: session?.sandboxBranch,
      backgroundAgents: chat?.backgroundAgents,
      goal: chat?.goal,
      providerAccountId: chat?.providerAccountId,
    },
    intendedBranch: session?.branchName,
    model,
    setModel: chatModel.setModel,
    modelOptions,
    displayTraits: resolveTraitsForDisplay(model, chatModel.traits),
    executionTraits: buildTraitsExecutionPayload(model, chatModel.traits),
    onTraitsChange: chatModel.setTraits,
    providerAccountId: chatModel.providerAccountId ?? null,
    persistAccount: chatModel.persistProviderAccountId,
    prewarm: chatModel.prewarm,
    ports,
    cancel: () =>
      common.firstRun.isInProgress
        ? cancelFirstRun({ taskId })
        : owned
          ? cancelChat({ chatId: owned.chatId })
          : Promise.resolve(null),
  };
}

/**
 * A project task: model, account and traits stay on the task doc (shared with
 * the activity composer); traits are sticky on Convex like sessions.
 */
function useTaskRowChatBinding({
  taskId,
  task,
  common,
}: {
  taskId: Id<"agentTasks">;
  task: TaskChatTask;
  common: BindingCommon;
}): SandboxChatBinding {
  const { repo } = useRepo();
  const { accounts, firstRun } = common;
  const addMessage = useMutation(
    api.agentTaskChatWorkflow.addMessage,
  ).withOptimisticUpdate((localStore, args) =>
    insertSentTurnOptimistically(localStore, args.taskId, args, accounts),
  );
  const startExecute = useMutation(
    api.agentTaskChatWorkflow.startExecute,
  ).withOptimisticUpdate((localStore, args) =>
    openChatTurnOptimistically(localStore, args.taskId),
  );
  const enqueueMessage = useMutation(api.agentTaskChatWorkflow.enqueueMessage);
  const cancelExecution = useMutation(
    api.agentTaskChatWorkflow.cancelExecution,
  );
  // The first run is its own workflow, not a chat turn, so Stop has to reach
  // the task workflow while it owns the bubble.
  const cancelFirstRun = useMutation(api.taskWorkflow.cancelExecution);
  const prewarmChatDaemonNow = useAction(
    api.agentTaskChatWorkflow.prewarmChatDaemonNow,
  );
  const updateTask = useMutation(api.agentTasks.update);
  const setTraits = useMutation(api.agentTasks.setTraits).withOptimisticUpdate(
    (localStore, args) => {
      patchLoadedQuery(
        localStore,
        api.agentTasks.get,
        { id: args.id },
        (cur) => cur && { ...cur, ...composerTraitFields(args) },
      );
    },
  );

  const model = normalizeAIModel(
    task?.model ?? repo.defaultModel ?? DEFAULT_AI_MODEL,
  );
  const storedTraits: StoredModelTraits = storedComposerTraits(task);
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);

  return {
    ...common,
    entity: { kind: "task", taskId },
    doc: task,
    model,
    setModel: (next) => {
      void updateTask({ id: taskId, model: normalizeAIModel(next) });
    },
    modelOptions,
    displayTraits: resolveTraitsForDisplay(model, storedTraits),
    executionTraits: buildTraitsExecutionPayload(model, storedTraits),
    onTraitsChange: (partial) => {
      void setTraits({ id: taskId, ...toRunTraitArgs(partial) });
    },
    providerAccountId: task?.providerAccountId ?? null,
    persistAccount: (providerAccountId) =>
      updateTask({ id: taskId, providerAccountId }),
    prewarm: () => prewarmChatDaemonNow({ taskId }),
    ports: {
      add: (args) => addMessage({ taskId, ...args }),
      start: (args) => startExecute({ taskId, ...args }),
      enqueue: (args) => enqueueMessage({ taskId, ...args }),
    },
    cancel: () =>
      firstRun.isInProgress
        ? cancelFirstRun({ taskId })
        : cancelExecution({ taskId }),
  };
}

// Quick tasks open the chat with the first run rendered as a normal turn:
// the task prompt as the user message, the run's activity log + summary as
// the assistant reply. From the moment the run starts, so its steps stream
// here rather than into a timeline accordion on the task page (see
// firstRunChatTurn.ts).
function useTaskFirstRunChatTurn(
  taskId: Id<"agentTasks">,
  task: TaskChatTask,
): NonNullable<SandboxChatBinding["firstRun"]> {
  const isQuickTask = task != null && task.projectId === undefined;
  const runs = useQuery(
    api.agentRuns.listByTask,
    isQuickTask ? { taskId } : "skip",
  );
  const firstRun = findFirstRunChatTurnRun(runs);
  const isInProgress =
    firstRun !== undefined && isRunInProgress(firstRun.status);
  // The log row is only written when the run completes, so an in-flight run
  // reads its live activity off the streaming row instead.
  const activityLog = useQuery(
    api.agentRuns.getActivityLog,
    firstRun && !isInProgress ? { id: firstRun._id } : "skip",
  );
  const streaming = useQuery(
    api.streaming.get,
    firstRun && isInProgress
      ? { entityId: taskRunStreamingEntityId(firstRun._id) }
      : "skip",
  );
  const { taskAttachments, firstRunMedia } = useFirstRunMediaQueries(
    taskId,
    task,
    firstRun,
  );
  const turn =
    task && firstRun && (isInProgress || activityLog !== undefined)
      ? buildFirstRunChatTurn({
          task,
          run: firstRun,
          activityLog: activityLog ?? null,
          ...(taskAttachments !== undefined
            ? { attachments: taskAttachments }
            : {}),
          ...(firstRunMedia !== undefined ? { media: firstRunMedia } : {}),
        })
      : [];
  return { isInProgress, streaming, turn };
}

function useFirstRunMediaQueries(
  taskId: Id<"agentTasks">,
  task: TaskChatTask,
  firstRun: TaskChatRun,
) {
  const taskAttachments = useQuery(
    api.agentTasks.listAttachments,
    firstRun && (task?.attachmentStorageIds?.length ?? 0) > 0
      ? { taskId }
      : "skip",
  );
  // Screenshots and recordings the run left behind, uploaded by the sandbox as
  // it finished. Only resolved when the run says it has some, so a text-only
  // run costs no extra query.
  const firstRunMedia = useQuery(
    api.agentRuns.getMedia,
    firstRun && (firstRun.mediaStorageIds?.length ?? 0) > 0
      ? { id: firstRun._id }
      : "skip",
  );
  return { taskAttachments, firstRunMedia };
}
