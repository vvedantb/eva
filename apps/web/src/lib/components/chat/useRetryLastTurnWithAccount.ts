"use client";

import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import type { ChatEntityRef } from "./sandboxChatSurface";

/**
 * Retry of the chat's failed last turn on another provider account. A chat
 * with no session yet has no turn to retry. The caller reports failures: the
 * banner wraps the switch and this retry in one `catchMutationError`, so a
 * toast here would be the second one.
 */
export function useRetryLastTurnWithAccount(
  entity: ChatEntityRef | undefined,
): (providerAccountId: Id<"userProviderAccounts"> | null) => Promise<null> {
  const retrySessionTurn = useMutation(
    api.sessionWorkflow.retryLastTurnWithAccount,
  );

  return async (providerAccountId: Id<"userProviderAccounts"> | null) =>
    entity
      ? await retrySessionTurn({ chatId: entity.chatId, providerAccountId })
      : null;
}
