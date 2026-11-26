import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Soft UX lock for agent-driven browsing. MCP browser_lock / browser_unlock
 * call this with the sandbox token's session; the session's UI reacts to
 * `agentBrowsingAt` for auto-switch + takeover overlay.
 */
export const setAgentBrowsingAt = internalMutation({
  args: {
    sessionId: v.string(),
    locked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sessionId = ctx.db.normalizeId("sessions", args.sessionId);
    if (!sessionId || !(await ctx.db.get(sessionId))) return null;
    await ctx.db.patch(sessionId, {
      agentBrowsingAt: args.locked ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
