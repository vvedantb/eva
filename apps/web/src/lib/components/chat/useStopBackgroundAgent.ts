"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { ChatEntityRef } from "./sandboxChatSurface";

/**
 * Stop request for one background agent, routed to whichever chat owns it.
 * All three mutations are bound up front — hooks cannot be called
 * conditionally, and an unused binding costs nothing.
 */
export function useStopBackgroundAgent(
  entity: ChatEntityRef,
): (toolUseId: string) => Promise<void> {
  const stopSessionAgent = useMutation(
    api.sessionWorkflow.requestStopBackgroundAgent,
  );
  const stopTaskAgent = useMutation(
    api.agentTaskChatWorkflow.requestStopBackgroundAgent,
  );
  const stopProjectAgent = useMutation(
    api.projectChatWorkflow.requestStopBackgroundAgent,
  );

  return async (toolUseId: string) => {
    const request =
      entity.kind === "session"
        ? stopSessionAgent({ chatId: entity.chatId, toolUseId })
        : entity.kind === "task"
          ? stopTaskAgent({ taskId: entity.taskId, toolUseId })
          : stopProjectAgent({ projectId: entity.projectId, toolUseId });
    await catchMutationError(
      request,
      "Couldn't stop background agent",
      "chat-bg-agent-stop",
    );
  };
}
