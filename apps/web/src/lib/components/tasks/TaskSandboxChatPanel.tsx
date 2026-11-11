"use client";

import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import {
  api,
  DEFAULT_AI_MODEL,
  normalizeAIModel,
  type Id,
} from "@eva/backend";
import {
  SandboxChatPanel,
  type SandboxChatPanelProps,
} from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { useOwnedChatBinding } from "@/lib/components/chat/useOwnedChatBinding";
import {
  buildFirstRunChatTurn,
  findFirstRunChatTurnRun,
  isRunInProgress,
  taskRunStreamingEntityId,
} from "@/lib/components/tasks/firstRunChatTurn";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useTaskOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { useTaskSession } from "./useTaskSession";

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
 * The task side of the sandbox chat. A task chats in a session chat (a quick
 * task's own session's Main chat, a project task's own chat in its project's
 * session), whose sticky model, traits and account drive the composer; a
 * quick task's first run shows as the opening turn.
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
  const { repo } = useRepo();
  // The first run is its own workflow, not a chat turn, so Stop has to reach
  // the task workflow while it owns the bubble.
  const cancelFirstRun = useMutation(api.taskWorkflow.cancelExecution);
  return useOwnedChatBinding({
    ownedSession: taskSession,
    // Before the session exists, the same seed `ensureOwned` gives its chat.
    seedModel: normalizeAIModel(
      task?.lastChatModel ?? task?.model ?? repo.defaultModel ?? DEFAULT_AI_MODEL,
    ),
    // No session yet means no transcript yet: the task keys read empty.
    fallbackEntity: { kind: "task", taskId },
    title: task?.title,
    common,
    cancelOther: () =>
      firstRun.isInProgress ? cancelFirstRun({ taskId }) : undefined,
  });
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
