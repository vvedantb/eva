"use client";

import { api, normalizeAIModel, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useSessionOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { useChatModel } from "@/lib/hooks/useChatModel";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { isAssistantTurnInProgress } from "@/lib/components/chat/chatBodyUtils";

/**
 * Sends an annotation as chat display text + rich agent prompt into the
 * session's active chat tab. Queues with displayContent when a turn is
 * already running.
 */
export function useSessionAnnotationSend(
  sessionId: Id<"sessions">,
  chatId: Id<"sessionChats">,
): (display: string, full: string) => Promise<void> {
  const { repo } = useRepo();
  const defaultModel = normalizeAIModel(repo.defaultModel);
  // Model + traits + account are owned by Convex, per chat.
  const {
    model,
    traits,
    providerAccountId: stickyProviderAccountId,
  } = useChatModel(chatId, defaultModel);
  const { displayTraits, executionTraits, providerAccountId } =
    useSessionSettings({
      defaultModel,
      model,
      traits,
      providerAccountId: stickyProviderAccountId,
    });
  // Owner-scoped, matching the composer picker — resolving against the
  // viewer's own accounts would drop the sticky account to Team.
  const { resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId);

  const messages = useQuery(api.messages.listByParent, { parentId: chatId });
  const turnStatus = useQuery(api.turns.getChatStatus, { chatId });
  const addMessage = useMutation(api.sessions.addMessage);
  const startExecution = useMutation(api.sessionWorkflow.startExecute);
  const enqueueMessage = useMutation(api.sessionWorkflow.enqueueMessage);

  const isExecuting =
    turnStatus === undefined
      ? isAssistantTurnInProgress(messages ?? [])
      : turnStatus !== null;

  return async (display: string, full: string) => {
    const accountId = resolveAccountId(providerAccountId);
    const reasoningLevel = displayTraits.effortLevel;
    if (isExecuting) {
      await enqueueMessage({
        chatId,
        message: full,
        displayContent: display,
        model,
        ...executionTraits,
        reasoningLevel,
        providerAccountId: accountId,
      });
      return;
    }
    await Promise.all([
      addMessage({
        chatId,
        role: "user",
        content: display,
        providerAccountId: accountId,
        model,
        reasoningLevel,
      }),
      startExecution({
        chatId,
        message: full,
        model,
        ...executionTraits,
        reasoningLevel,
        providerAccountId: accountId,
      }),
    ]);
  };
}
