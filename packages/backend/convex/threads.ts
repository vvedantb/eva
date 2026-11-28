import { v } from "convex/values";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertMessageParentAccess, authMutation, authQuery } from "./functions";
import {
  countUnreadReplies,
  findThreadParticipant,
  markThreadRead,
  newestReplyAt,
} from "./_messages/threadParticipants";

async function readableRoot(
  db: DatabaseReader,
  rawRootId: string,
  userId: Id<"users">,
): Promise<Doc<"messages"> | null> {
  const rootId = db.normalizeId("messages", rawRootId);
  const root = rootId ? await db.get(rootId) : null;
  if (!root || root.replyTo !== undefined) return null;
  await assertMessageParentAccess(db, root.parentId, userId);
  return root;
}

export const readState = authQuery({
  args: { rootId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      following: v.boolean(),
      lastReadAt: v.optional(v.number()),
      unread: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const root = await readableRoot(ctx.db, args.rootId, ctx.userId);
    if (!root) return null;
    const row = await findThreadParticipant(ctx.db, ctx.userId, root._id);
    if (!row) return null;
    return {
      following: row.following,
      lastReadAt: row.lastReadAt,
      unread: row.following ? await countUnreadReplies(ctx.db, row) : 0,
    };
  },
});

/** The thread is on screen: read up to now, and its notifications are read. */
export const markRead = authMutation({
  args: { rootId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const root = await readableRoot(ctx.db, args.rootId, ctx.userId);
    if (root) await markThreadRead(ctx, ctx.userId, root);
    return null;
  },
});

/**
 * Follow or Unfollow. Unfollowing stops reply notifications; an @mention
 * still notifies. Following a thread you were not in makes you a
 * participant, read up to its newest reply.
 */
export const setFollowing = authMutation({
  args: { rootId: v.string(), following: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const root = await readableRoot(ctx.db, args.rootId, ctx.userId);
    if (!root) throw new Error("Message not found");
    const [row, readAt] = await Promise.all([
      findThreadParticipant(ctx.db, ctx.userId, root._id),
      newestReplyAt(ctx.db, root._id),
    ]);
    if (row) {
      if (row.following !== args.following) {
        await ctx.db.patch(row._id, { following: args.following });
      }
      return null;
    }
    await ctx.db.insert("threadParticipants", {
      rootId: root._id,
      userId: ctx.userId,
      following: args.following,
      lastReadAt: readAt,
    });
    return null;
  },
});
