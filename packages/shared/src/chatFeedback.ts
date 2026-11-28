import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";

export type ChatFeedbackRow = FunctionReturnType<
  typeof api.feedback.listForChat
>[number];
export type FeedbackSentiment = ChatFeedbackRow["sentiment"];

/**
 * One chat's feedback: the viewer's own thumbs, keyed by the turn or recap
 * they rate (one each), and the agent's reports, which the transcript places as
 * cards like its other inline cards.
 */
export function groupChatFeedback(
  rows: readonly ChatFeedbackRow[],
  viewerId: string | undefined,
): {
  mineByMessageId: Map<string, ChatFeedbackRow>;
  mineByRecapId: Map<string, ChatFeedbackRow>;
  agentReports: ChatFeedbackRow[];
} {
  const mineByMessageId = new Map<string, ChatFeedbackRow>();
  const mineByRecapId = new Map<string, ChatFeedbackRow>();
  const agentReports: ChatFeedbackRow[] = [];
  for (const row of rows) {
    if (row.author !== "user") {
      agentReports.push(row);
      continue;
    }
    if (row.userId !== viewerId) continue;
    if (row.messageId) mineByMessageId.set(row.messageId, row);
    if (row.recapId) mineByRecapId.set(row.recapId, row);
  }
  return { mineByMessageId, mineByRecapId, agentReports };
}
