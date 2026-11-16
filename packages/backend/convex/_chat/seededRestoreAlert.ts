import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ensureMainChat } from "../_sessionChats/helpers";

/**
 * Chat alert for a failed seeded Supabase restore. The restore is non-fatal
 * (see `restoreSeededRuntimeState`) so the dev server still launches; this is
 * the only place the user learns the local database did not come up. Posted
 * in the session's Main chat.
 */
export const insert = internalMutation({
  args: {
    parentId: v.id("sessions"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.parentId);
    if (!session) return null;
    const parentId = (await ensureMainChat(ctx, session))._id;
    await ctx.db.insert("messages", {
      parentId,
      role: "assistant",
      content:
        "Local database failed to start — dev server launched anyway. Pages that need the database may error.",
      timestamp: Date.now(),
      isSystemAlert: true,
      alertTone: "warning",
      errorDetail: args.error.slice(0, 4000),
    });
    return null;
  },
});
