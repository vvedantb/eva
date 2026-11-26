"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { showsProjectTaskPrompt } from "@eva/shared/projectView";
import {
  SandboxChatPanel,
  type SandboxChatPanelProps,
} from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { useOwnedChatBinding } from "@/lib/components/chat/useOwnedChatBinding";
import { useTaskOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { ProjectTaskPromptCard } from "@/lib/components/projects/ProjectTaskPromptCard";
import { useTaskSession } from "./useTaskSession";

/**
 * A task's sandbox chat. A project task in To Do with an empty chat shows its
 * prompt card there (`ProjectTaskPromptCard`).
 */
export function TaskSandboxChatPanel({
  taskId,
  ...panel
}: SandboxChatPanelProps & { taskId: Id<"agentTasks"> }) {
  const binding = useTaskChatBinding(taskId);
  const task = useQuery(api.agentTasks.get, { id: taskId });
  return (
    <SandboxChatPanel
      binding={binding}
      emptyState={
        task && showsProjectTaskPrompt(task) ? (
          <ProjectTaskPromptCard taskId={taskId} />
        ) : undefined
      }
      {...panel}
    />
  );
}

/**
 * The task side of the sandbox chat: the Main chat of the task's own
 * session, whose sticky model, traits and account drive the composer. Every
 * run of the task is a turn in this chat (the server writes its prompt and
 * reply, `_taskWorkflow/runChatTurn.ts`).
 */
export function useTaskChatBinding(
  taskId: Id<"agentTasks">,
): SandboxChatBinding {
  const task = useQuery(api.agentTasks.get, { id: taskId });
  const taskSession = useTaskSession(taskId, task);
  const accounts = useTaskOwnerProviderAccounts(taskId);
  return useOwnedChatBinding({
    ownedSession: taskSession,
    ownerLabel: "task",
    title: task?.title,
    common: {
      accounts: accounts.options,
      resolveAccountId: accounts.resolveId,
    },
    // A run can start before the task's chat exists; naming the task reaches
    // it then.
    stopTarget: { taskId },
  });
}
