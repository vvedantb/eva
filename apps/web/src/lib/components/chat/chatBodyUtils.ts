import { getAIModelProvider, type api, type Doc, type Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
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

export { buildPrecedingUserTurns } from "@eva/shared";
export { findStreamingTargetMessage } from "@eva/shared";
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
  basePath: string;
}

/** The id a chat's messages hang off: a session chat, or a pre-chat session. */
export type ChatParentId = Id<"sessionChats"> | Id<"sessions">;

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
    if (seen === turns) return start;
    seen++;
    start = i;
  }
  return 0;
}

type TurnShapeMessage = Pick<
  ChatBodyMessage,
  "role" | "content" | "isSystemAlert" | "finishedAt"
> & { _id: string };

type ChatTurnStatus = NonNullable<
  FunctionReturnType<typeof api.turns.getChatStatus>
>;

/**
 * Whether an assistant turn is executing for one chat. One rule for every
 * surface (session, quick task, project) and every reader of it (composer,
 * queue, subagent thread, Agents roster, design panel), so they cannot
 * disagree on the same chat:
 * - a run the surface renders as a turn (a quick task's first run) counts
 *   while it runs;
 * - otherwise the chat's durable turn is canonical, synthetic turns included;
 * - except when that turn's own reply bubble has finished: the server closes
 *   the turn and finishes its bubble in one mutation, so a finished bubble
 *   proves the turn is over even if the status the client holds is stale
 *   (seen in prod: Stop button and beam stayed until a refresh);
 * - message shape only covers the first render while that status loads, so a
 *   stale empty bubble cannot keep a settled turn "executing".
 * Streaming rows are not an input: they can outlive their turn, so callers
 * gate them on this result instead.
 */
export function isChatTurnExecuting({
  status,
  messages,
  isFirstRunInProgress = false,
}: {
  status: ChatTurnStatus | null | undefined;
  messages: ReadonlyArray<TurnShapeMessage> | undefined;
  isFirstRunInProgress?: boolean;
}): boolean {
  if (isFirstRunInProgress) return true;
  if (status === undefined) return isAssistantTurnInProgress(messages ?? []);
  if (status === null) return false;
  if (status.source !== "durable" || status.placeholderMessageId === undefined) {
    return true;
  }
  const reply = messages?.find((m) => m._id === status.placeholderMessageId);
  return reply?.finishedAt === undefined;
}

function isAssistantTurnInProgress(
  messages: ReadonlyArray<TurnShapeMessage>,
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.isSystemAlert) continue;
    return (
      message.role === "assistant" &&
      !message.content &&
      message.finishedAt === undefined
    );
  }
  return false;
}
