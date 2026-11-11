import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { tempId } from "@vvedantb/server";
import { toast } from "@vvedantb/ui";
import type { ModelAccount } from "@vvedantb/ui";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import {
  transcriptTailArgs,
  type TranscriptMessage,
  type TranscriptParentId,
} from "@/lib/hooks/useChatTranscript";
import { resolveCredentialSourceLabel } from "@/lib/utils/credentialSourceLabel";
import { appendReviewCommentsToPrompt } from "@/lib/reviewComments";
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
 * Patches both transcript subscriptions (`useChatTranscript`): the tail the
 * chat paints first and the full list that replaces it.
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
  for (const queryArgs of [{ parentId }, transcriptTailArgs(parentId)]) {
    const existing = localStore.getQuery(api.messages.listByParent, queryArgs);
    if (existing === undefined) continue;
    localStore.setQuery(api.messages.listByParent, queryArgs, [
      ...existing,
      userMsg,
      assistantPlaceholder,
    ]);
  }
}

export interface ChatTurnSendOptions extends ChatSendOptions {
  /**
   * Skip appending the pending review comments to the prompt (and leave them
   * pending). For harness built-ins like `/compact`, which must reach the
   * harness as bare text.
   */
  skipReviewComments?: boolean;
  /** Sessions: the proposed plan this turn implements. */
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
  /** The chat's mutations; `add` carries `insertSentTurnOptimistically`. */
  ports: SandboxTurnPorts;
  settings: SandboxTurnSettings;
  /** Stops whatever turn owns the chat bubble. */
  cancel: () => Promise<null>;
  /** The `drafts` row "Restore draft" writes back to. */
  draftTarget: ChatDraftTarget;
  /** A turn owns the chat: the send queues behind it. */
  isExecuting: boolean;
  /**
   * An idle chat still queues: Eva is asleep (the queue wakes her) or a usage
   * limit holds the chosen provider. See `sandboxComposerState`.
   */
  queuesSends: boolean;
}) {
  const review = usePendingReviewComments();
  const setDraft = useMutation(api.drafts.set);

  // The composer clears optimistically, so a failed send's prompt only exists
  // in this closure. Writing the failure as an assistant turn used to read like
  // Eva replying "Error: …" while the user's own message was gone — the toast
  // says whose failure it is and hands the typed prompt back through the same
  // `drafts` row the composer reads (ChatDraftSync pulls it live).
  const raiseSendFailure = (errorMessage: string, draftContent: string) => {
    toast.error("Couldn't send your message", {
      id: `${draftTarget.kind}-send`,
      description: readableSendError(errorMessage),
      action: {
        label: "Restore draft",
        onClick: () => {
          void setDraft({ target: draftTarget, content: draftContent });
        },
      },
    });
  };

  const handleSend = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
    options?: ChatTurnSendOptions,
  ) => {
    // Harness commands go to the harness verbatim, and the pending comments are
    // not consumed — so they must survive the send too.
    const sentComments =
      options?.skipReviewComments === true ? [] : (review?.comments ?? []);
    // What the user typed. A ChatBody send has already appended its citation /
    // snapshot / WebMCP blocks to `content`, and that XML is not theirs to
    // re-edit, so the restore has to use the pre-append text.
    const draftContent = options?.draftContent ?? content;
    // Hoisted out of the `try`: React Compiler bails on the whole file when it
    // meets expression-level control flow inside one (eva/no-value-block-in-try).
    const mode = isExecuting || queuesSends ? "queue" : "start";
    const input = {
      message: appendReviewCommentsToPrompt(content, sentComments),
      attachmentStorageIds,
      sourceProposedPlanId: options?.sourceProposedPlanId,
    };
    try {
      // Awaited rather than fired and forgotten: the caller cannot tell a
      // delivered send from a failed one unless this settles with it. The
      // composer still empties instantly — ChatBody observes this promise
      // instead of blocking its submit on it.
      await sendSandboxTurn(ports, settings, input, mode);
    } catch (error) {
      // The optimistic user bubble has rolled back too, so the toast is the
      // only thing left standing for this turn.
      raiseSendFailure(
        error instanceof Error ? error.message : "",
        draftContent,
      );
      // Rethrow: the caller tells a delivered send from a failed one by
      // whether this settles, and keeps its pending chips on a failure.
      throw error;
    }
    // Same contract as ChatBody's pending context: consumed only once the send
    // landed, and only the comments that went into this prompt.
    for (const comment of sentComments) review?.remove(comment.id);
  };

  const handleCancel = async () => {
    await catchMutationError(
      cancel(),
      "Couldn't cancel execution",
      `${draftTarget.kind}-cancel-execution`,
    );
  };

  return {
    handleSend,
    handleCancel,
    /** Pending review comments let an empty composer submit. */
    hasPendingReviewComments: (review?.comments.length ?? 0) > 0,
  };
}
