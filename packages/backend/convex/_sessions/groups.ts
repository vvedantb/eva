import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { authMutation, getSessionWithAccess } from "../functions";

/** The group a session belongs to; throws when it is in none. */
function requireGroupId(session: {
  sessionGroupId?: Id<"sessionGroups">;
}): Id<"sessionGroups"> {
  if (!session.sessionGroupId) throw new Error("Session is not in a group");
  return session.sessionGroupId;
}

/** Names (or, with a blank name, un-names) the session's linked-session group. */
export const renameGroup = authMutation({
  args: { sessionId: v.id("sessions"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    const name = args.name.trim();
    await ctx.db.patch(requireGroupId(session), {
      name: name || undefined,
    });
    return null;
  },
});

/**
 * Takes a session out of its linked-session group. A group left with one
 * member dissolves, so a group always links two or more sessions.
 */
export const removeFromGroup = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    const groupId = requireGroupId(session);
    await ctx.db.patch(session._id, { sessionGroupId: undefined });
    const rest = await ctx.db
      .query("sessions")
      .withIndex("by_session_group", (q) => q.eq("sessionGroupId", groupId))
      .take(2);
    if (rest.length > 1) return null;
    for (const member of rest) {
      await ctx.db.patch(member._id, { sessionGroupId: undefined });
    }
    await ctx.db.delete(groupId);
    return null;
  },
});
