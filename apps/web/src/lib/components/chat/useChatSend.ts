import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { tempId } from "@vvedantb/server";
import { toast } from "@vvedantb/ui";
import type { ModelAccount } from "@vvedantb/ui";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type {
  TranscriptMessage,
  TranscriptParentId,
} from "@/lib/hooks/useChatTranscript";
import { resolveCredentialSourceLabel } from "@eva/shared/usageLimitRecovery";
import { appendReviewCommentsToPrompt } from "@eva/shared";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { readableSendError } from "./chatBodyUtils";
import type { ChatSendOptions } from "./ChatBody";
import {
  sendSandboxTurn,
  type SandboxTurnAddArgs,
  type SandboxTurnPorts,
  type SandboxTurnSettings,
} from "./sandboxChatTurn";
import type { ChatDraftTarget } from "./useChatDraftSeed";

/**
 * Optimistic update for a chat's `addMessage`: the user's bubble and an empty
 * assistant placeholder show at once, before the mutation round-trips. Every
 * chat (session, quick task, project) attaches this to its own `addMessage`.
 * Patches every live transcript subscription of the chat (`useChatTranscript`):
 * the tail it paints first and the `since` list it follows.
 */
export function insertSentTurnOptimistically(
  localStore: OptimisticLocalStore,
  parentId: TranscriptParentId,
  args: SandboxTurnAddArgs,
  accounts: ReadonlyArray<ModelAccount>,
) {
  if ((args.role ?? "user") !== "user") return;
  const now = Date.now();
  const userMsg: TranscriptMessage = {
    _id: tempId("messages"),
    _creationTime: now,
    parentId,
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
  const assistantPlaceholder: TranscriptMessage = {
    _id: tempId("messages"),
    _creationTime: now + 1,
    parentId,
    role: "assistant",
    content: "",
    timestamp: now + 1,
    activityLog: "",
  };
  for (const { args: queryArgs, value } of localStore.getAllQueries(
    api.messages.listByParent,
  )) {
    if (
      value === undefined ||
      queryArgs.parentId !== parentId ||
      queryArgs.before !== undefined
    ) {
      continue;
    }
    localStore.setQuery(api.messages.listByParent, queryArgs, [
      ...value,
      userMsg,
      assistantPlaceholder,
    ]);
  }
}

export interface ChatTurnSendOptions extends ChatSendOptions {
  skipReviewComments?: boolean;
  sourceProposedPlanId?: Id<"proposedPlans">;
}

/**
 * Send / queue / cancel for one chat: a session chat tab, a quick task or a
 * project. The surface hands over its mutations (`ports`) and settings; the
 * prompt, the queue-or-start rule and the failure toast live here only.
 */
export function useChatSend({
  ports,
  settings,
  cancel,
  draftTarget,
  isExecuting,
  queuesSends,
}: {
  ports: SandboxTurnPorts;
  settings: SandboxTurnSettings;
  cancel: () => Promise<null>;
  draftTarget: ChatDraftTarget | undefined;
  isExecuting: boolean;
  queuesSends: boolean;
}) {
  const review = usePendingReviewComments();
  const setDraft = useMutation(api.drafts.set);

  const raiseSendFailure = (errorMessage: string, draftContent: string) => {
    toast.error("Couldn't send your message", {
      id: "chat-send",
      description: readableSendError(errorMessage),
      ...(draftTarget
        ? {
            action: {
              label: "Restore draft",
              onClick: () => {
                void setDraft({ target: draftTarget, content: draftContent });
              },
            },
          }
        : {}),
    });
  };

  const handleSend = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
    options?: ChatTurnSendOptions,
  ) => {
    const sentComments =
      options?.skipReviewComments === true ? [] : (review?.comments ?? []);
    const draftContent = options?.draftContent ?? content;
    const mode = isExecuting || queuesSends ? "queue" : "start";
    const input = {
      message: appendReviewCommentsToPrompt(content, sentComments),
      attachmentStorageIds,
      sourceProposedPlanId: options?.sourceProposedPlanId,
    };
    try {
      await sendSandboxTurn(ports, settings, input, mode);
    } catch (error) {
      raiseSendFailure(
        error instanceof Error ? error.message : "",
        draftContent,
      );
      throw error;
    }
    for (const comment of sentComments) review?.remove(comment.id);
  };

  const handleCancel = async () => {
    await catchMutationError(
      cancel(),
      "Couldn't cancel execution",
      "chat-cancel-execution",
    );
  };

  return {
    handleSend,
    handleCancel,
    hasPendingReviewComments: (review?.comments.length ?? 0) > 0,
  };
}
