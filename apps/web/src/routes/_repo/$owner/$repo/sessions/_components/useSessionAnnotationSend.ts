"use client";

import { api, normalizeAIModel, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useSessionOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { useChatModel } from "@/lib/hooks/useChatModel";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { isAssistantTurnInProgress } from "@/lib/components/chat/chatBodyUtils";
import type { AnnotationSubmission } from "../_utils/-previewAnnotation";

/**
 * Sends an annotation as chat display text + rich agent prompt into the
 * active chat tab. Queues with displayContent when that chat's turn is
 * already running. A `note` is also saved to the session's Log, which the
 * Documents tab shows.
 */
export function useSessionAnnotationSend(
  sessionId: Id<"sessions">,
  chatId: Id<"sessionChats">,
  isRouteActive = true,
): (submission: AnnotationSubmission) => Promise<void> {
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
  const { resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId, isRouteActive);

  const messages = useHeldQuery(
    api.messages.listByParent,
    isRouteActive ? { parentId: chatId } : "skip",
  );
  const turnStatus = useHeldQuery(
    api.turns.getChatStatus,
    isRouteActive ? { entityId: chatId } : "skip",
  );
  const addMessage = useMutation(api.sessions.addMessage);
  const startExecution = useMutation(api.sessionWorkflow.startExecute);
  const enqueueMessage = useMutation(api.sessionWorkflow.enqueueMessage);
  const appendLogEntry = useMutation(api.chatLog.append);

  const isExecuting =
    turnStatus === undefined
      ? isAssistantTurnInProgress(messages ?? [])
      : turnStatus !== null;

  return async ({ display, full, note }: AnnotationSubmission) => {
    // Saved before the send: a failed save keeps the card open with nothing
    // sent, so a retry cannot post the turn twice.
    if (note) {
      await appendLogEntry({
        source: { kind: "session", sessionId },
        kind: "note",
        author: "user",
        title: note.title,
        body: note.body,
      });
    }
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
    ]).catch(async (error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send annotation";
      await addMessage({
        chatId,
        role: "assistant",
        content: `Error: ${errorMessage}`,
      });
    });
  };
}
