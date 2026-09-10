"use client";

import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import type { ChatEntityRef } from "./sandboxChatSurface";

/**
 * Retry of the failed last turn on another provider account, routed to
 * whichever chat owns it. All three mutations are bound up front — hooks cannot
 * be called conditionally, and an unused binding costs nothing. The caller
 * reports failures: the banner wraps the switch and this retry in one
 * `catchMutationError`, so a toast here would be the second one.
 */
export function useRetryLastTurnWithAccount(
  entity: ChatEntityRef,
): (providerAccountId: Id<"userProviderAccounts"> | null) => Promise<null> {
  const retrySessionTurn = useMutation(
    api.sessionWorkflow.retryLastTurnWithAccount,
  );
  const retryTaskTurn = useMutation(
    api.agentTaskChatWorkflow.retryLastTurnWithAccount,
  );
  const retryProjectTurn = useMutation(
    api.projectChatWorkflow.retryLastTurnWithAccount,
  );

  return async (providerAccountId: Id<"userProviderAccounts"> | null) => {
    return entity.kind === "session"
      ? await retrySessionTurn({
          sessionId: entity.sessionId,
          providerAccountId,
        })
      : entity.kind === "task"
        ? await retryTaskTurn({ taskId: entity.taskId, providerAccountId })
        : await retryProjectTurn({
            projectId: entity.projectId,
            providerAccountId,
          });
  };
}
