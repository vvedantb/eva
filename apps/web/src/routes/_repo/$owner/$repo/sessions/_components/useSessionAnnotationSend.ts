"use client";

import { api, normalizeAIModel, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useSessionOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { useSessionModel } from "@/lib/hooks/useSessionModel";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { isAssistantTurnInProgress } from "@/lib/components/chat/chatBodyUtils";

/**
 * Sends an annotation as chat display text + rich agent prompt.
 * Queues with displayContent when a turn is already running.
 */
export function useSessionAnnotationSend(
  sessionId: Id<"sessions">,
  isRouteActive = true,
): (display: string, full: string) => Promise<void> {
  const { repo } = useRepo();
  const defaultModel = normalizeAIModel(repo.defaultModel);
  // Model + traits + account are owned by Convex.
  const {
    model,
    traits,
    providerAccountId: stickyProviderAccountId,
  } = useSessionModel(sessionId, defaultModel, isRouteActive);
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
    isRouteActive ? { parentId: sessionId } : "skip",
  );
  const turnStatus = useHeldQuery(
    api.turns.getSessionStatus,
    isRouteActive ? { sessionId } : "skip",
  );
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
        sessionId,
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
        id: sessionId,
        role: "user",
        content: display,
        providerAccountId: accountId,
        model,
        reasoningLevel,
      }),
      startExecution({
        sessionId,
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
        id: sessionId,
        role: "assistant",
        content: `Error: ${errorMessage}`,
      });
    });
  };
}
