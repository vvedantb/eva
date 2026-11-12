import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { findEntitySession } from "../_sessions/owner";

const entityKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

/**
 * Soft UX lock for agent-driven browsing. MCP browser_lock / browser_unlock
 * call this; the session's UI reacts to `agentBrowsingAt` for auto-switch +
 * takeover overlay. A task or project locks its session's browser.
 */
export const setAgentBrowsingAt = internalMutation({
  args: {
    entityKind: entityKindValidator,
    entityId: v.string(),
    locked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agentBrowsingAt = args.locked ? Date.now() : undefined;
    const updatedAt = Date.now();

    // A task's or project's browser is its session's.
    const session = await findEntitySession(
      ctx.db,
      args.entityKind,
      args.entityId,
    );
    if (session) {
      await ctx.db.patch(session._id, { agentBrowsingAt, updatedAt });
    }
    return null;
  },
});
