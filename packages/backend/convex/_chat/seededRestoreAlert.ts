import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

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
    await ctx.db.insert("messages", {
      parentId: args.parentId,
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
