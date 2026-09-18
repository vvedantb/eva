import { api } from "@eva/backend";
import type {
  AIModel,
  Id,
  ModelTraitsExecutionArgs,
} from "@eva/backend";
import type { ModelAccount } from "@eva/ui";
import { useMutation } from "convex/react";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

import { resolveCredentialSourceLabel } from "@/lib/utils/credentialSourceLabel";
import { appendReviewCommentsToPrompt } from "@/lib/reviewComments";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import {
  isAssistantTurnInProgress,
  readableSendError,
} from "@/lib/components/chat/chatBodyUtils";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { toast } from "@eva/ui";
export type SessionMessage = NonNullable<
  FunctionReturnType<typeof api.messages.listByParent>
>[number];

// Convex has no non-assertion way to mint an Id<T> before the server assigns
// one; this is the single, contained assertion for optimistic-insert temp ids.
function optimisticMessageId(): Id<"messages"> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- Convex Id<T> is an opaque branded string; there is no non-assertion way to mint a client-side optimistic temp id
  return crypto.randomUUID() as Id<"messages">;
}

function applyAddMessageOptimistically(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.sessions.addMessage>,
  accounts: ReadonlyArray<ModelAccount>,
) {
  if (args.role !== "user") return;
  const existing = localStore.getQuery(api.messages.listByParent, {
    parentId: args.id,
  });
  if (existing === undefined) return;

  const now = Date.now();
  const userMsg: SessionMessage = {
    _id: optimisticMessageId(),
    _creationTime: now,
    parentId: args.id,
    role: "user",
    content: args.content,
    timestamp: now,
    activityLog: "",
    attachmentStorageIds: args.attachmentStorageIds,
    credentialSourceLabel: resolveCredentialSourceLabel(
      args.providerAccountId,
      accounts,
    ),
    model: args.model,
    reasoningLevel: args.reasoningLevel,
  };
  const assistantPlaceholder: SessionMessage = {
    _id: optimisticMessageId(),
    _creationTime: now + 1,
    parentId: args.id,
    role: "assistant",
    content: "",
    timestamp: now + 1,
    activityLog: "",
  };
  localStore.setQuery(api.messages.listByParent, { parentId: args.id }, [
    ...existing,
    userMsg,
    assistantPlaceholder,
  ]);
}

export interface SessionSendOptions {
  /**
   * Skip appending the pending review comments to the prompt (and leave them
   * pending). For harness built-ins like `/compact`, which must reach the
   * harness as bare text.
   */
  skipReviewComments?: boolean;
  sourceProposedPlanId?: Id<"proposedPlans">;
}

interface UseSessionSendParams {
  sessionId: Id<"sessions">;
  model: AIModel;
  executionTraits: ModelTraitsExecutionArgs;
  /** Effective effort shown in the composer; snapshotted onto the user message. */
  reasoningLevel?: ModelTraitsExecutionArgs["reasoningLevel"];
  providerAccountId: string | null;
  resolveAccountId: (
    id: string | null,
  ) => Id<"userProviderAccounts"> | undefined;
  accounts: ReadonlyArray<ModelAccount>;
  messages: SessionMessage[];
  /** Cached-hidden shells skip the turn-status subscription. */
  isRouteActive?: boolean;
}

export function useSessionSend({
  sessionId,
  model,
  executionTraits,
  reasoningLevel,
  providerAccountId,
  resolveAccountId,
  accounts,
  messages,
  isRouteActive = true,
}: UseSessionSendParams) {
  const review = usePendingReviewComments();
  const addMessage = useMutation(api.sessions.addMessage).withOptimisticUpdate(
    (localStore, args) =>
      applyAddMessageOptimistically(localStore, args, accounts),
  );
  const startExecution = useMutation(api.sessionWorkflow.startExecute);
  const enqueueMessage = useMutation(api.sessionWorkflow.enqueueMessage);
  const cancelExecutionMutation = useMutation(
    api.sessionWorkflow.cancelExecution,
  );
  const setDraft = useMutation(api.drafts.set);
  const turnStatus = useHeldQuery(
    api.turns.getSessionStatus,
    isRouteActive ? { sessionId } : "skip",
  );

  // The persisted open turn is canonical. Message shape only covers the first
  // render while that subscription loads, so a stale empty bubble cannot keep
  // the composer in queue mode after the turn has terminally settled.
  const isExecuting =
    turnStatus === undefined
      ? isAssistantTurnInProgress(messages)
      : turnStatus !== null;

  const handleSend = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
    options?: SessionSendOptions,
  ) => {
    // Harness commands go to the harness verbatim, and the pending comments are
    // not consumed — so they must survive the send too.
    const consumesReviewComments = options?.skipReviewComments !== true;
    const finalContent = consumesReviewComments
      ? appendReviewCommentsToPrompt(content, review?.comments ?? [])
      : content;
    if (isExecuting) {
      await enqueueMessage({
        sessionId,
        message: finalContent,
        model,
        ...executionTraits,
        reasoningLevel: reasoningLevel ?? executionTraits.reasoningLevel,
        providerAccountId: resolveAccountId(providerAccountId),
        attachmentStorageIds,
      });
      if (consumesReviewComments) review?.clear();
      return;
    }
    const accountId = resolveAccountId(providerAccountId);
    void Promise.all([
      addMessage({
        id: sessionId,
        role: "user",
        content: finalContent,
        attachmentStorageIds,
        providerAccountId: accountId,
        model,
        reasoningLevel: reasoningLevel ?? executionTraits.reasoningLevel,
      }),
      startExecution({
        sessionId,
        message: finalContent,
        model,
        ...executionTraits,
        reasoningLevel: reasoningLevel ?? executionTraits.reasoningLevel,
        providerAccountId: accountId,
        attachmentStorageIds,
        ...(options?.sourceProposedPlanId !== undefined
          ? { sourceProposedPlanId: options.sourceProposedPlanId }
          : {}),
      }),
    ])
      .catch((error) => {
        // The composer has already cleared and the optimistic user bubble has
        // rolled back, so the prompt only exists here. Writing the failure as an
        // assistant turn used to read like Eva replying "Error: …" while the
        // user's own message was gone — the toast says whose failure it is and
        // hands the typed prompt back through the same `drafts` row the composer
        // reads (ChatDraftSync pulls it live).
        toast.error("Couldn't send your message", {
          id: "session-send",
          description: readableSendError(
            error instanceof Error ? error.message : "",
          ),
          action: {
            label: "Restore draft",
            onClick: () => {
              void setDraft({
                target: { kind: "sessionChat", sessionId },
                // The tokenized content the user typed, not `finalContent` —
                // the appended review comments are not theirs to re-edit.
                content,
              });
            },
          },
        });
      })
      .finally(() => {
        if (consumesReviewComments) review?.clear();
      });
  };

  const handleCancel = async () => {
    await catchMutationError(
      cancelExecutionMutation({ sessionId }),
      "Couldn't cancel execution",
      "session-cancel-execution",
    );
  };

  return { isExecuting, handleSend, handleCancel };
}
