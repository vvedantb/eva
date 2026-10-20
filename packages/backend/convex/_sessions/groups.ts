import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseWriter } from "../_generated/server";
import { authMutation, getSessionWithAccess } from "../functions";

/** The group a session belongs to; throws when it is in none. */
function requireGroupId(session: {
  sessionGroupId?: Id<"sessionGroups">;
}): Id<"sessionGroups"> {
  if (!session.sessionGroupId) throw new Error("Session is not in a group");
  return session.sessionGroupId;
}

/**
 * The group `anchor` belongs to, for another session to join. An anchor not
 * yet in a group gets a new one. The caller has already checked access.
 */
export async function ensureSessionGroup(
  db: DatabaseWriter,
  anchor: Doc<"sessions">,
  userId: Id<"users">,
): Promise<Id<"sessionGroups">> {
  if (anchor.sessionGroupId) return anchor.sessionGroupId;
  const groupId = await db.insert("sessionGroups", { createdBy: userId });
  await db.patch(anchor._id, { sessionGroupId: groupId });
  return groupId;
}

/**
 * Takes a session out of its group. A group left with one member dissolves,
 * so a group always links two or more sessions.
 */
async function leaveSessionGroup(
  db: DatabaseWriter,
  session: Doc<"sessions">,
): Promise<void> {
  const groupId = requireGroupId(session);
  await db.patch(session._id, { sessionGroupId: undefined });
  const rest = await db
    .query("sessions")
    .withIndex("by_session_group", (q) => q.eq("sessionGroupId", groupId))
    .take(2);
  if (rest.length > 1) return;
  for (const member of rest) {
    await db.patch(member._id, { sessionGroupId: undefined });
  }
  await db.delete(groupId);
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
 * Puts an existing session into `groupSessionId`'s linked-session group
 * (created when that session is in none). A session already in another group
 * moves, and the group it left dissolves if one member remains.
 */
export const addToGroup = authMutation({
  args: { sessionId: v.id("sessions"), groupSessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.sessionId === args.groupSessionId) {
      throw new Error("A session cannot join its own group");
    }
    const [session, anchor] = await Promise.all([
      getSessionWithAccess(ctx.db, args.sessionId, ctx.userId),
      getSessionWithAccess(ctx.db, args.groupSessionId, ctx.userId),
    ]);
    if (
      session.sessionGroupId &&
      session.sessionGroupId === anchor.sessionGroupId
    ) {
      return null;
    }
    if (session.sessionGroupId) await leaveSessionGroup(ctx.db, session);
    const groupId = await ensureSessionGroup(ctx.db, anchor, ctx.userId);
    await ctx.db.patch(session._id, { sessionGroupId: groupId });
    return null;
  },
});

/** Takes a session out of its linked-session group. */
export const removeFromGroup = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    await leaveSessionGroup(ctx.db, session);
    return null;
  },
});
