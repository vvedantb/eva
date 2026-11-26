import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const SEED_MARKER = "<!-- proof-seed -->";

export const seed = internalMutation({
  args: { sessionId: v.id("sessions"), content: v.string() },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("sessionChats")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (chat === null) throw new Error("no chat");
    return await ctx.db.insert("messages", {
      role: "assistant",
      content: `${args.content}\n\n${SEED_MARKER}`,
      timestamp: Date.now(),
      finishedAt: Date.now(),
      parentId: chat._id,
    });
  },
});

export const unseed = internalMutation({
  args: { id: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row !== null && row.content.endsWith(SEED_MARKER)) {
      await ctx.db.delete(args.id);
    }
    return null;
  },
});
