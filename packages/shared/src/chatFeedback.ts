import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";

export type ChatFeedbackRow = FunctionReturnType<
  typeof api.feedback.listForChat
>[number];
export type FeedbackSentiment = ChatFeedbackRow["sentiment"];

/**
 * One chat's feedback, keyed by the turn it is about: the viewer's own thumbs
 * (one per turn) and the agent's reports (shown as cards under the turn).
 */
export function groupChatFeedback(
  rows: readonly ChatFeedbackRow[],
  viewerId: Id<"users"> | undefined,
): {
  mineByMessageId: Map<string, ChatFeedbackRow>;
  agentByMessageId: Map<string, ChatFeedbackRow[]>;
} {
  const mineByMessageId = new Map<string, ChatFeedbackRow>();
  const agentByMessageId = new Map<string, ChatFeedbackRow[]>();
  for (const row of rows) {
    if (!row.messageId) continue;
    if (row.author === "user") {
      if (row.userId === viewerId) mineByMessageId.set(row.messageId, row);
      continue;
    }
    const existing = agentByMessageId.get(row.messageId);
    if (existing) existing.push(row);
    else agentByMessageId.set(row.messageId, [row]);
  }
  return { mineByMessageId, agentByMessageId };
}
