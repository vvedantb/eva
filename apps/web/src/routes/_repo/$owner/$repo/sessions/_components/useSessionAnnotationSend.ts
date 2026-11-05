"use client";

import { api, normalizeAIModel, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useSessionOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { useChatModel } from "@/lib/hooks/useChatModel";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import {
  chatTurnOpenFromStatus,
  openChatTurnOptimistically,
} from "@/lib/components/chat/useChatTurnOpen";
import { isChatTurnExecuting } from "@/lib/components/chat/chatBodyUtils";
import {
  annotationSender,
  type AnnotationSubmit,
} from "@/lib/components/sandbox/annotationSend";

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
  const { resolveId: resolveAccountId } = useSessionOwnerProviderAccounts(
    sessionId,
    isRouteActive,
  );

  const messages = useHeldQuery(
    api.messages.listByParent,
    isRouteActive ? { parentId: chatId } : "skip",
  );
  const turnStatus = useHeldQuery(
    api.turns.getChatStatus,
    isRouteActive ? { entityId: chatId } : "skip",
  );
  const addMessage = useMutation(api.sessions.addMessage);
  const startExecution = useMutation(
    api.sessionWorkflow.startExecute,
  ).withOptimisticUpdate((localStore, args) =>
    openChatTurnOptimistically(localStore, args.chatId),
  );
  const enqueueMessage = useMutation(api.sessionWorkflow.enqueueMessage);

  const isExecuting = isChatTurnExecuting({
    turnOpen: chatTurnOpenFromStatus(turnStatus),
    messages,
  });

  return annotationSender({
    isExecuting,
    enqueue: (display, full) =>
      enqueueMessage({
        chatId,
        message: full,
        displayContent: display,
        model,
        ...executionTraits,
        reasoningLevel: displayTraits.effortLevel,
        providerAccountId: resolveAccountId(providerAccountId),
      }),
    send: async (display, full) => {
      const accountId = resolveAccountId(providerAccountId);
      const reasoningLevel = displayTraits.effortLevel;
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
    },
    postError: (content) => addMessage({ chatId, role: "assistant", content }),
  });
}
