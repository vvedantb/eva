/**
 * Model / account snapshot for each assistant row: the user turn directly
 * before it (where send/dequeue stores model + credentialSourceLabel), skipping
 * system alerts. An assistant row that follows another assistant row has none.
 *
 * One pass for the whole transcript — looking each row up separately was
 * O(n²), and it re-ran on every streamed token. Shared by the web chat and the
 * mobile chat footer.
 */
export function buildPrecedingUserTurns<
  T extends { _id: string; role: string; isSystemAlert?: boolean },
>(messages: ReadonlyArray<T>): Map<string, T> {
  const byAssistantId = new Map<string, T>();
  let previous: T | undefined;
  for (const message of messages) {
    if (message.isSystemAlert) continue;
    if (message.role === "assistant" && previous?.role === "user") {
      byAssistantId.set(message._id, previous);
    }
    previous = message;
  }
  return byAssistantId;
}
