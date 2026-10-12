import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { assertMessageParentAccess, authQuery } from "./functions";
import { chatTurnEntityIdValidator } from "./validators";

/** The tail says what comes next; older turns only add cost. */
const PREDICTION_CONTEXT_MESSAGE_LIMIT = 30;

/**
 * True when the agent's turn is over and the chat waits on the user. A running,
 * failed or question-asking turn gets no prediction: the next step is not a
 * free-form message there.
 */
function waitsOnUser(message: Doc<"messages">): boolean {
  return (
    message.role === "assistant" &&
    message.finishedAt !== undefined &&
    message.errorDetail === undefined &&
    message.pendingQuestion === undefined
  );
}

/**
 * The finished reply a composer prediction would follow, or null when there is
 * nothing to predict. Public so `textGen.predictNextMessage` checks chat access
 * as the calling user before it spends a model call.
 *
 * System rows ("Sandbox stopped") are skipped: they land after the reply in
 * most idle chats, and the user is still answering that reply.
 */
export const getPredictionTarget = authQuery({
  args: { parentId: chatTurnEntityIdValidator },
  returns: v.union(v.id("messages"), v.null()),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .order("desc")
      .take(PREDICTION_CONTEXT_MESSAGE_LIMIT);
    const latest = recent.find((message) => message.isSystemAlert !== true);
    return latest && waitsOnUser(latest) ? latest._id : null;
  },
});

/** The recent transcript, oldest first, for the prediction prompt. */
export const getPredictionMessages = internalQuery({
  args: { parentId: chatTurnEntityIdValidator },
  returns: v.array(
    v.object({
      role: v.string(),
      content: v.string(),
      isSystemAlert: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => {
    const newestFirst = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .order("desc")
      .take(PREDICTION_CONTEXT_MESSAGE_LIMIT);
    return newestFirst.reverse().map((message) => ({
      role: message.role,
      content: message.content,
      isSystemAlert: message.isSystemAlert,
    }));
  },
});
