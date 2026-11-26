import { getAIModelProvider, type Doc, type Id } from "@eva/backend";
import { getProviderLabel } from "@vvedantb/ui";
import type { ActivityStep } from "@vvedantb/ui";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import {
  collectQuestionSteps,
  otherUserIdsInChat,
  readableErrorMessage,
  stripReviewCommentBlocks,
  turnErrorTitle as sharedTurnErrorTitle,
  type ChatUserAttribution,
} from "@eva/shared";
import { tokenizedToEditable } from "@/lib/components/mentions";

// Moved to `@eva/shared` so the mobile chat footer reads the same turn model.
export { buildPrecedingUserTurns } from "@eva/shared";
// Moved to `@eva/shared` so the mobile chat streams into the same bubble.
export { findStreamingTargetMessage } from "@eva/shared";
// Moved to `@eva/shared` so the mobile Stop button follows the same turn rule.
export { isChatTurnExecuting } from "@eva/shared";
// Moved to `@eva/shared` so the mobile chat draws a teammate's turn as the web.
export {
  findBubbleGroups,
  firstNameByUserId,
  firstNameFromUser,
  isOtherUserChatMessage,
  otherUserIdsInChat,
} from "@eva/shared";

/**
 * The codebase a chat belongs to. Manager Ave has none, so it passes nothing:
 * skill slash items, the prompt stash and repo mentions all switch off.
 */
export interface ChatRepo {
  id: Id<"githubRepos">;
  /** Repo route prefix, e.g. `/owner/repo` or `/owner/repo--app`. */
  basePath: string;
}

/** The id a chat's messages hang off: a session chat, or a pre-chat session. */
export type ChatParentId = Id<"sessionChats"> | Id<"sessions">;

// `_id` is widened to `string` so client-built rows (optimistic sends) fit
// without forging a branded id. Real docs stay assignable; nothing in the chat tree
// feeds `_id` back into Convex. `parentId` is dropped so Manager Ave's
// `aveMessages` rows (keyed by thread, not by chat entity) fit too.
export type ChatBodyMessage = Omit<Doc<"messages">, "_id" | "parentId"> & {
  _id: string;
  media?: { url: string | null; contentType: string | null }[];
  /** @deprecated Prefer `attachments` — kept for optimistic/local messages. */
  attachmentUrls?: (string | null)[];
  attachments?: {
    url: string | null;
    contentType: string | null;
  }[];
};

/**
 * User turns that switched provider: a stamped row whose provider differs from
 * the previous stamped row's. Unstamped legacy turns (sent before model was
 * recorded) are skipped entirely rather than treated as an unknown provider —
 * otherwise the first stamped turn of every old conversation looks like a
 * handoff. System alerts (the "Handed off from X to Y" rows) are skipped too.
 */
export function findHandoffBoundaryIds(
  messages: ReadonlyArray<{
    _id: string;
    isSystemAlert?: boolean;
    model?: ChatBodyMessage["model"];
    role: ChatBodyMessage["role"];
  }>,
): Set<string> {
  const boundaries = new Set<string>();
  let previousProvider: string | undefined;

  for (const message of messages) {
    if (message.isSystemAlert) continue;
    if (message.role !== "user" || message.model === undefined) continue;
    const provider = getAIModelProvider(message.model);
    if (previousProvider !== undefined && previousProvider !== provider) {
      boundaries.add(message._id);
    }
    previousProvider = provider;
  }
  return boundaries;
}

export type ChatBodyQueuedMessage = Doc<"queuedMessages">;

/**
 * A follow-up the server already holds for the next turn, so it cannot be
 * edited, removed or reordered (Manager Ave). Shown in the same queue panel.
 */
export interface ChatHeldFollowUp {
  id: string;
  content: string;
  userId?: Id<"users">;
}

// Moved to `@eva/shared` so the phone draws the same rows.
export { collectQuestionSteps, isSandboxLifecycleAlert, visibleChatMessages } from "@eva/shared";

/** True when the transcript has a teammate bubble that needs a display name. */
export function chatNeedsOtherUserDirectory(
  messages: ReadonlyArray<ChatUserAttribution>,
  currentUserId: string | undefined,
): boolean {
  return otherUserIdsInChat(messages, currentUserId).length > 0;
}

/** Streaming and question-record flags for an assistant row. */
export function getAssistantTurnState(message: ChatBodyMessage): {
  isStreamingPlaceholder: boolean;
  questionSteps: ActivityStep[];
} {
  const isStreamingPlaceholder =
    message.role === "assistant" &&
    !message.content &&
    message.finishedAt === undefined;
  const steps =
    !isStreamingPlaceholder &&
    message.role === "assistant" &&
    message.activityLog
      ? (parseActivitySteps(message.activityLog) ?? [])
      : [];
  return {
    isStreamingPlaceholder,
    questionSteps: collectQuestionSteps(steps),
  };
}

// Moved to `@eva/shared` so the phone shows a failed turn the same way.
export { stripErrorPrefix } from "@eva/shared";

/** `@eva/shared`'s `turnErrorTitle`, naming providers as the web kit does. */
export function turnErrorTitle(args: {
  errorType: ChatBodyMessage["errorType"];
  turnModel: string | undefined;
  messageModel: string | undefined;
}): string | null {
  return sharedTurnErrorTitle({ ...args, providerLabel: getProviderLabel });
}

/** The failure a send threw, as the user should read it (`readableErrorMessage`). */
export function readableSendError(message: string): string {
  return readableErrorMessage(message, "Something went wrong");
}

/** Previously sent user messages as editable display text, newest-first. */
export function buildMessageHistory(
  messages: ReadonlyArray<
    Pick<ChatBodyMessage, "role" | "isSystemAlert" | "content">
  >,
): string[] {
  return messages
    .flatMap((m) => {
      if (m.role !== "user" || m.isSystemAlert || !m.content) return [];
      return [
        tokenizedToEditable(stripReviewCommentBlocks(m.content).text)
          .displayText,
      ];
    })
    .reverse();
}

/** Index of the latest user message for ChatLastTurn viewport pinning. */
export function findLastUserMessageIndex(messages: ChatBodyMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === "user" && !message.isSystemAlert) {
      return i;
    }
  }
  return -1;
}

/** User turns a chat renders when it opens; older turns load on scroll. */
export const TRANSCRIPT_TURN_WINDOW = 25;

/**
 * Index of the row that starts the window of `turns` user turns ending before
 * `endIndex`. Zero when no older turn is left, so the window then covers the
 * whole transcript, including any rows before the first user turn.
 */
export function findTurnWindowStart(
  messages: ReadonlyArray<Pick<ChatBodyMessage, "role" | "isSystemAlert">>,
  turns: number,
  endIndex: number = messages.length,
): number {
  let seen = 0;
  let start = 0;
  for (let i = endIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user" || message.isSystemAlert) continue;
    // One turn past the window means older turns exist: start at the window's
    // first user row. Otherwise the window runs to the top.
    if (seen === turns) return start;
    seen++;
    start = i;
  }
  return 0;
}
