import { getAIModelProvider, type Doc } from "@eva/backend";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { tokenizedToEditable } from "@/lib/components/mentions";
import { stripReviewCommentBlocks } from "@/lib/reviewComments";
import {
  collectChangedFiles,
  type ChangedFile,
} from "@/lib/components/chat/ChangedFilesCard";
import { z } from "zod";

// `_id` is widened to `string` so callers can prepend client-built synthetic
// turns (the quick task's first-run activity in the sandbox chat) without
// forging a branded id. Real docs stay assignable; nothing in the chat tree
// feeds `_id` back into Convex.
export type ChatBodyMessage = Omit<Doc<"messages">, "_id"> & {
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

const SANDBOX_LIFECYCLE_ALERTS = new Set([
  "Sandbox started",
  "Sandbox stopped",
  "Sandbox reconnected",
]);

export function isSandboxLifecycleAlert(
  message: Pick<ChatBodyMessage, "isSystemAlert" | "content">,
): boolean {
  return (
    message.isSystemAlert === true &&
    SANDBOX_LIFECYCLE_ALERTS.has(message.content)
  );
}

/**
 * Simple view omits all system-alert banners. Sandbox start/stop/reconnect
 * rows are always hidden — they spam the transcript on every VM cycle.
 * Rows stay in Convex; this only affects rendering, empty-state, and
 * last-message targeting. Execution helpers already skip `isSystemAlert`.
 */
export function visibleChatMessages<
  M extends Pick<ChatBodyMessage, "isSystemAlert" | "content">,
>(messages: M[], hideSystemAlerts: boolean): M[] {
  const hidden = (message: M) =>
    isSandboxLifecycleAlert(message) ||
    (hideSystemAlerts && message.isSystemAlert === true);
  if (!messages.some(hidden)) return messages;
  return messages.filter((message) => !hidden(message));
}

// Boundary schema for the pending-question JSON emitted by the agent. A
// question with any malformed field (or option) is dropped via
// `.catch(null)` + filter, matching the previous per-item guard behaviour.
const questionSchema = z.object({
  question: z.string(),
  header: z.string(),
  multiSelect: z.boolean(),
  options: z.array(z.object({ label: z.string(), description: z.string() })),
});

export type ParsedQuestion = z.infer<typeof questionSchema>;

const pendingQuestionSchema = z.object({
  questions: z.array(questionSchema.nullable().catch(null)),
});

export function parsePendingQuestion(
  raw: string | undefined | null,
): ParsedQuestion[] | null {
  if (!raw) return null;
  try {
    const parsed = pendingQuestionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const questions = parsed.data.questions.flatMap((q) => (q ? [q] : []));
    return questions.length > 0 ? questions : null;
  } catch {
    return null;
  }
}

/** First name for chat labels; falls back to the first word of full name. */
export function firstNameFromUser(user: {
  firstName?: string | null;
  fullName?: string | null;
}): string | null {
  return user.firstName?.trim() || user.fullName?.trim().split(" ")[0] || null;
}

type ChatUserAttribution = {
  role: ChatBodyMessage["role"];
  userId?: string;
  isSystemAlert?: boolean;
};

/** Teammate user turn (not yours). Missing ids → treat as own to avoid layout flash. */
export function isOtherUserChatMessage(
  message: ChatUserAttribution,
  currentUserId: string | undefined,
): boolean {
  return (
    !message.isSystemAlert &&
    message.role === "user" &&
    message.userId !== undefined &&
    currentUserId !== undefined &&
    message.userId !== currentUserId
  );
}

/** True when the transcript has a teammate bubble that needs a display name. */
export function chatNeedsOtherUserDirectory(
  messages: ReadonlyArray<ChatUserAttribution>,
  currentUserId: string | undefined,
): boolean {
  return otherUserIdsInChat(messages, currentUserId).length > 0;
}

/** Sorted unique teammate ids that need a name lookup. Empty → skip the query. */
export function otherUserIdsInChat<TUserId extends string>(
  messages: ReadonlyArray<{
    role: ChatBodyMessage["role"];
    userId?: TUserId;
    isSystemAlert?: boolean;
  }>,
  currentUserId: TUserId | undefined,
): TUserId[] {
  const ids = new Set<TUserId>();
  for (const message of messages) {
    if (!isOtherUserChatMessage(message, currentUserId)) continue;
    if (message.userId === undefined) continue;
    ids.add(message.userId);
  }
  return [...ids].sort();
}

/** Streaming / changed-files flags for an assistant row. */
export function getAssistantTurnState(message: ChatBodyMessage): {
  isStreamingPlaceholder: boolean;
  changedFiles: ChangedFile[];
} {
  const isStreamingPlaceholder =
    message.role === "assistant" &&
    !message.content &&
    message.finishedAt === undefined;
  const changedFiles =
    !isStreamingPlaceholder &&
    message.role === "assistant" &&
    message.activityLog
      ? collectChangedFiles(parseActivitySteps(message.activityLog) ?? [])
      : [];
  return { isStreamingPlaceholder, changedFiles };
}

/**
 * The failure text without the harness's `Error: ` stamp. A failed turn is
 * already framed as an error by the notice around it, so the prefix only
 * repeats what the icon and the title say.
 */
export function stripErrorPrefix(content: string): string {
  const trimmed = content.trim();
  const prefix = /^error:\s*/i.exec(trimmed);
  return prefix === null ? trimmed : trimmed.slice(prefix[0].length);
}

/**
 * The bubble the session-scoped streaming row belongs to: the oldest empty,
 * unfinished assistant bubble. Turns execute FIFO, so when a queued turn's
 * placeholder is inserted while an older turn (a synthetic loop continuation,
 * say) is still streaming, the older bubble owns the streamed tokens and the
 * new placeholder takes over only once that turn finalises. Attaching to the
 * newest bubble instead made the old turn's stream jump below the user's newer
 * message, then vanish when the old turn finalised above it.
 */
export function findStreamingTargetMessage<
  M extends Pick<
    ChatBodyMessage,
    "role" | "content" | "isSystemAlert" | "finishedAt"
  >,
>(messages: ReadonlyArray<M>): M | undefined {
  return messages.find(
    (message) =>
      message.role === "assistant" &&
      message.isSystemAlert !== true &&
      !message.content &&
      message.finishedAt === undefined,
  );
}

/** Previously sent user messages as editable display text, newest-first. */
export function buildMessageHistory(messages: ChatBodyMessage[]): string[] {
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

/** Latest non-alert assistant turn, used for adaptive changed-file disclosure. */
export function findLastAssistantMessageId(
  messages: ReadonlyArray<
    Pick<ChatBodyMessage, "_id" | "role" | "isSystemAlert">
  >,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.isSystemAlert) continue;
    if (message.role === "assistant") return message._id;
  }
  return undefined;
}

/**
 * Model / account snapshot for an assistant row: walks back to the preceding
 * user turn (where send/dequeue stores model + credentialSourceLabel).
 */
export function findPrecedingUserTurn(
  messages: ReadonlyArray<ChatBodyMessage>,
  assistantMessageId: string,
): ChatBodyMessage | undefined {
  const index = messages.findIndex(
    (message) => message._id === assistantMessageId,
  );
  if (index < 0) return undefined;
  for (let i = index - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.isSystemAlert) continue;
    if (message.role === "user") return message;
    if (message.role === "assistant") return undefined;
  }
  return undefined;
}

/**
 * Whether a session/task chat still has an unfinished Working bubble.
 * System alerts (`isSystemAlert`) are skipped — they can append mid-turn and
 * must not make the composer think the reply finished.
 */
export function isAssistantTurnInProgress(
  messages: ReadonlyArray<
    Pick<ChatBodyMessage, "role" | "content" | "isSystemAlert" | "finishedAt">
  >,
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

/** One tick per user turn for the jump rail. */
export function buildJumpRailTicks(
  messages: ChatBodyMessage[],
): Array<{ id: string; content: string; reply?: string }> {
  const ticks: Array<{ id: string; content: string; reply?: string }> = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message || message.role !== "user" || message.isSystemAlert) {
      continue;
    }
    let reply: string | undefined;
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (!next || next.isSystemAlert) continue;
      if (next.role === "user") break;
      if (next.role === "assistant") {
        reply = next.content;
        break;
      }
    }
    ticks.push({
      id: message._id,
      content: message.content,
      ...(reply !== undefined && reply.length > 0 ? { reply } : {}),
    });
  }
  return ticks;
}
