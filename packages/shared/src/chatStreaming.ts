/**
 * The live turn of a chat: the `streamingActivity` row it streams to, and the
 * bubble that row belongs to. Shared by the web chat (`ChatBody`) and the
 * mobile chat, so both draw the same turn from the same row.
 */

/**
 * `api.streaming.get` entity id for a session chat's turn: the chat id itself.
 * Same as the backend's `sessionChatStreamingEntityId`.
 */
export function chatStreamingEntityId(chatId: string): string {
  return String(chatId);
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
  M extends {
    role: string;
    content: string;
    isSystemAlert?: boolean;
    finishedAt?: number;
  },
>(messages: ReadonlyArray<M>): M | undefined {
  return messages.find(
    (message) =>
      message.role === "assistant" &&
      message.isSystemAlert !== true &&
      !message.content &&
      message.finishedAt === undefined,
  );
}
