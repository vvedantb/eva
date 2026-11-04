import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { chatEntityKindValidator } from "../validators";

/**
 * Soft UX lock for agent-driven browsing, generalized across the three
 * sandbox-hosting tables. MCP browser_lock / browser_unlock call this; each
 * entity's UI reacts to `agentBrowsingAt` for auto-switch + takeover overlay
 * (see sessions.agentBrowsingAt for the original session-only version).
 */
export const setAgentBrowsingAt = internalMutation({
  args: {
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
    locked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agentBrowsingAt = args.locked ? Date.now() : undefined;
    const updatedAt = Date.now();

    if (args.entityKind === "session") {
      const id = ctx.db.normalizeId("sessions", args.entityId);
      if (!id) return null;
      if (!(await ctx.db.get(id))) return null;
      await ctx.db.patch(id, { agentBrowsingAt, updatedAt });
    } else if (args.entityKind === "task") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      if (!id) return null;
      if (!(await ctx.db.get(id))) return null;
      await ctx.db.patch(id, { agentBrowsingAt, updatedAt });
    } else {
      const id = ctx.db.normalizeId("projects", args.entityId);
      if (!id) return null;
      if (!(await ctx.db.get(id))) return null;
      await ctx.db.patch(id, { agentBrowsingAt, updatedAt });
    }
    return null;
  },
});
