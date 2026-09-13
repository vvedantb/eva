import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { hasRepoAccess } from "../functions";

const entityKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

/**
 * Soft UX lock for agent-driven browsing, generalized across the three
 * sandbox-hosting tables. MCP browser_lock / browser_unlock call this; each
 * entity's UI reacts to `agentBrowsingAt` for auto-switch + takeover overlay
 * (see sessions.agentBrowsingAt for the original session-only version).
 */
export const setAgentBrowsingAt = internalMutation({
  args: {
    entityKind: entityKindValidator,
    entityId: v.string(),
    locked: v.boolean(),
    clerkUserId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkUserId))
      .first();
    if (!user) return null;

    const agentBrowsingAt = args.locked ? Date.now() : undefined;
    const updatedAt = Date.now();

    if (args.entityKind === "session") {
      const id = ctx.db.normalizeId("sessions", args.entityId);
      if (!id) return null;
      const session = await ctx.db.get(id);
      if (!session) return null;
      if (!(await hasRepoAccess(ctx.db, session.repoId, user._id))) return null;
      await ctx.db.patch(id, { agentBrowsingAt, updatedAt });
    } else if (args.entityKind === "task") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      if (!id) return null;
      const task = await ctx.db.get(id);
      if (!task?.repoId) return null;
      if (!(await hasRepoAccess(ctx.db, task.repoId, user._id))) return null;
      await ctx.db.patch(id, { agentBrowsingAt, updatedAt });
    } else {
      const id = ctx.db.normalizeId("projects", args.entityId);
      if (!id) return null;
      const project = await ctx.db.get(id);
      if (!project) return null;
      if (!(await hasRepoAccess(ctx.db, project.repoId, user._id))) return null;
      await ctx.db.patch(id, { agentBrowsingAt, updatedAt });
    }
    return null;
  },
});
