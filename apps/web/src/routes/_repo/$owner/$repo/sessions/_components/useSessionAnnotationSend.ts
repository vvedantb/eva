"use client";

import { api, normalizeAIModel, type Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useSessionOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { useChatModel } from "@/lib/hooks/useChatModel";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useChatTranscript } from "@/lib/hooks/useChatTranscript";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { isChatTurnExecuting } from "@/lib/components/chat/chatBodyUtils";
import { sandboxAnnotationSender } from "@/lib/components/chat/sandboxChatTurn";
import type { AnnotationSubmit } from "@/lib/components/sandbox/annotationSend";
import { useSessionTurnPorts } from "./useSessionTurnPorts";

/**
 * Sends an annotation as chat display text + rich agent prompt into the
 * active chat tab. Queues with displayContent when that chat's turn is
 * already running.
 */
export function useSessionAnnotationSend(
  sessionId: Id<"sessions">,
  chatId: Id<"sessionChats">,
  isRouteActive = true,
): AnnotationSubmit {
  const { repo } = useRepo();
  const defaultModel = normalizeAIModel(repo.defaultModel);
  // Model + traits + account are owned by Convex.
  const {
    model,
    traits,
    providerAccountId: stickyProviderAccountId,
  } = useChatModel(chatId, defaultModel, isRouteActive);
  const { displayTraits, executionTraits, providerAccountId } =
    useSessionSettings({
      defaultModel,
      model,
      traits,
      providerAccountId: stickyProviderAccountId,
    });
  // Owner-scoped, matching the composer picker — resolving against the
  // viewer's own accounts would drop the sticky account to Team.
  const { options: accounts, resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId, isRouteActive);

  const messages = useChatTranscript(isRouteActive ? chatId : "skip");
  const turnStatus = useHeldQuery(
    api.turns.getChatStatus,
    isRouteActive ? { entityId: chatId } : "skip",
  );
  const ports = useSessionTurnPorts(chatId, accounts);

  const isExecuting = isChatTurnExecuting({
    status: turnStatus,
    messages,
  });
  return sandboxAnnotationSender(
    ports,
    {
      model,
      effortLevel: displayTraits.effortLevel,
      executionTraits,
      providerAccountId: resolveAccountId(providerAccountId),
    },
    isExecuting,
  );
}
