import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ensureMainChat } from "../_sessionChats/helpers";

/**
 * Chat alert for a failed seeded Supabase restore. The restore is non-fatal
 * (see `restoreSeededRuntimeState`) so the dev server still launches; this is
 * the only place the user learns the local database did not come up. Shared by
 * sessions, quick tasks and projects.
 */
export const insert = internalMutation({
  args: {
    parentId: v.union(v.id("sessions"), v.id("agentTasks"), v.id("projects")),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentId);
    if (!parent) return null;
    // A session's chat is its Main chat; tasks and projects are their own.
    const sessionId = ctx.db.normalizeId("sessions", args.parentId);
    const session = sessionId === null ? null : await ctx.db.get(sessionId);
    const parentId = session
      ? (await ensureMainChat(ctx, session))._id
      : args.parentId;
    await ctx.db.insert("messages", {
      parentId,
      role: "assistant",
      content:
        "Local database failed to start — dev server launched anyway. Pages that need the database may error.",
      timestamp: Date.now(),
      isSystemAlert: true,
      errorDetail: args.error.slice(0, 4000),
    });
    return null;
  },
});
