import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";

export type ChatFeedbackRow = FunctionReturnType<
  typeof api.feedback.listForChat
>[number];
export type FeedbackSentiment = ChatFeedbackRow["sentiment"];

/**
 * One chat's feedback: the viewer's own thumbs, keyed by the turn they rate
 * (one per turn), and the agent's reports, which the transcript places as
 * cards like its other inline cards.
 */
export function groupChatFeedback(
  rows: readonly ChatFeedbackRow[],
  viewerId: Id<"users"> | undefined,
): {
  mineByMessageId: Map<string, ChatFeedbackRow>;
  agentReports: ChatFeedbackRow[];
} {
  const mineByMessageId = new Map<string, ChatFeedbackRow>();
  const agentReports: ChatFeedbackRow[] = [];
  for (const row of rows) {
    if (row.author !== "user") {
      agentReports.push(row);
      continue;
    }
    if (row.messageId && row.userId === viewerId) {
      mineByMessageId.set(row.messageId, row);
    }
  }
  return { mineByMessageId, agentReports };
}
