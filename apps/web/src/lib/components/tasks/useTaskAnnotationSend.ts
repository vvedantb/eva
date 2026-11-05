"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  openChatTurnOptimistically,
  useChatTurnOpen,
} from "@/lib/components/chat/useChatTurnOpen";
import { isChatTurnExecuting } from "@/lib/components/chat/chatBodyUtils";
import { findFirstRunChatTurnRun, isRunInProgress } from "./firstRunChatTurn";
import { useTaskChatModelSettings } from "./TaskSandboxChatPanel";

/**
 * Task twin of `useSessionAnnotationSend`: sends a preview annotation as chat
 * display text + rich agent prompt into the task chat. Queues with
 * displayContent when a turn (or the quick task's first run) is running.
 */
export function useTaskAnnotationSend(
  taskId: Id<"agentTasks">,
): (display: string, full: string) => Promise<void> {
  const { repo } = useRepo();
  const task = useQuery(api.agentTasks.get, { id: taskId });
  const {
    model,
    displayTraits,
    executionTraits,
    providerAccountId,
    resolveAccountId,
  } = useTaskChatModelSettings(taskId, task, repo);
  const messages = useQuery(api.messages.listByParent, { parentId: taskId });
  const turnOpen = useChatTurnOpen(taskId);
  // Same rule as the task chat: the first run owns the bubble while it runs.
  const runs = useQuery(
    api.agentRuns.listByTask,
    task != null && task.projectId === undefined ? { taskId } : "skip",
  );
  const firstRun = findFirstRunChatTurnRun(runs);
  const isExecuting = isChatTurnExecuting({
    turnOpen,
    messages,
    isFirstRunInProgress:
      firstRun !== undefined && isRunInProgress(firstRun.status),
  });

  const addMessage = useMutation(api.agentTaskChatWorkflow.addMessage);
  const startExecute = useMutation(
    api.agentTaskChatWorkflow.startExecute,
  ).withOptimisticUpdate((localStore, args) =>
    openChatTurnOptimistically(localStore, args.taskId),
  );
  const enqueueMessage = useMutation(api.agentTaskChatWorkflow.enqueueMessage);

  return async (display: string, full: string) => {
    const accountId = resolveAccountId(providerAccountId);
    const reasoningLevel = displayTraits.effortLevel;
    if (isExecuting) {
      await enqueueMessage({
        taskId,
        message: full,
        displayContent: display,
        model,
        ...executionTraits,
        reasoningLevel: reasoningLevel ?? executionTraits.reasoningLevel,
        providerAccountId: accountId,
      });
      return;
    }
    await Promise.all([
      addMessage({
        taskId,
        content: display,
        providerAccountId: accountId,
        model,
        reasoningLevel,
      }),
      startExecute({
        taskId,
        message: full,
        model,
        ...executionTraits,
        providerAccountId: accountId,
      }),
    ]).catch(async (error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send annotation";
      await addMessage({
        taskId,
        role: "assistant",
        content: `Error: ${errorMessage}`,
      });
    });
  };
}
