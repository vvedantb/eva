import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { teamMentionRecipients } from "../_mentions/mentionRecipients";

const MAX_THREAD_PARTICIPANTS = 200;

/** Most new replies counted for the "N new" pill. */
export const MAX_UNREAD_REPLIES = 99;

export function findThreadParticipant(
  db: DatabaseReader,
  userId: Id<"users">,
  rootId: Id<"messages">,
): Promise<Doc<"threadParticipants"> | null> {
  return db
    .query("threadParticipants")
    .withIndex("by_user_and_root", (q) =>
      q.eq("userId", userId).eq("rootId", rootId),
    )
    .unique();
}

/**
 * Adds a person to a thread, following it. An existing row keeps its follow
 * choice. `readAt`: they just posted there, so the thread is read up to now.
 */
export async function joinThread(
  ctx: MutationCtx,
  rootId: Id<"messages">,
  userId: Id<"users">,
  readAt?: number,
): Promise<void> {
  const row = await findThreadParticipant(ctx.db, userId, rootId);
  if (!row) {
    await ctx.db.insert("threadParticipants", {
      rootId,
      userId,
      following: true,
      lastReadAt: readAt,
    });
    return;
  }
  if (readAt !== undefined && (row.lastReadAt ?? 0) < readAt) {
    await ctx.db.patch(row._id, { lastReadAt: readAt });
  }
}

/**
 * Everyone a person's reply makes a participant: the replier (read up to
 * the reply), the root's author when a person wrote it, and the people the root
 * and the reply mention.
 */
export async function joinThreadOnReply(
  ctx: MutationCtx,
  params: {
    root: Doc<"messages">;
    reply: Doc<"messages">;
    replierId: Id<"users">;
    mentionedIds: readonly Id<"users">[];
    repoId: Id<"githubRepos">;
  },
): Promise<void> {
  const { root, replierId } = params;
  const rootMentioned = await teamMentionRecipients(
    ctx,
    root.content,
    params.repoId,
    new Set([replierId]),
  );
  const others = new Set<Id<"users">>([
    ...(root.role === "user" && root.userId !== undefined ? [root.userId] : []),
    ...rootMentioned,
    ...params.mentionedIds,
  ]);
  others.delete(replierId);
  await joinThread(ctx, root._id, replierId, params.reply._creationTime);
  await Promise.all(
    [...others].map((userId) => joinThread(ctx, root._id, userId)),
  );
}

/** The people a reply in this thread notifies, before the author and mentions are taken out. */
export async function followingParticipantIds(
  db: DatabaseReader,
  rootId: Id<"messages">,
): Promise<Id<"users">[]> {
  const rows = await db
    .query("threadParticipants")
    .withIndex("by_root", (q) => q.eq("rootId", rootId))
    .take(MAX_THREAD_PARTICIPANTS);
  return rows.filter((row) => row.following).map((row) => row.userId);
}

/**
 * Replies the participant has not seen: rows after their last read that are
 * not their own (Eva's answers count). Capped at `MAX_UNREAD_REPLIES`.
 */
export async function countUnreadReplies(
  db: DatabaseReader,
  row: Doc<"threadParticipants">,
): Promise<number> {
  const replies = await db
    .query("messages")
    .withIndex("by_reply_to", (q) =>
      q.eq("replyTo", row.rootId).gt("_creationTime", row.lastReadAt ?? 0),
    )
    .take(MAX_UNREAD_REPLIES + 1);
  return Math.min(
    replies.filter(
      (reply) =>
        reply.isSystemAlert !== true &&
        !(reply.role === "user" && reply.userId === row.userId),
    ).length,
    MAX_UNREAD_REPLIES,
  );
}

/**
 * When the thread's newest reply was created: the clock unread counts with,
 * so "read up to here" never misses a reply written in the same millisecond.
 */
export async function newestReplyAt(
  db: DatabaseReader,
  rootId: Id<"messages">,
): Promise<number | undefined> {
  const newest = await db
    .query("messages")
    .withIndex("by_reply_to", (q) => q.eq("replyTo", rootId))
    .order("desc")
    .first();
  return newest?._creationTime;
}

/**
 * Opening a thread, or posting in it: the participant has read it up to its
 * newest reply, and the person's unread notifications about this thread
 * (replies, mentions, Eva's answers) are read. Notifications about the main
 * chat or other threads stay. Writes only what changed.
 */
export async function markThreadRead(
  ctx: MutationCtx,
  userId: Id<"users">,
  root: Doc<"messages">,
): Promise<void> {
  const [row, readAt, unread] = await Promise.all([
    findThreadParticipant(ctx.db, userId, root._id),
    newestReplyAt(ctx.db, root._id),
    ctx.db
      .query("notifications")
      .withIndex("by_user_and_thread_root_and_read", (q) =>
        q.eq("userId", userId).eq("threadRootId", root._id).eq("read", false),
      )
      .take(MAX_THREAD_PARTICIPANTS),
  ]);
  if (row && readAt !== undefined && (row.lastReadAt ?? 0) < readAt) {
    await ctx.db.patch(row._id, { lastReadAt: readAt });
  }
  await Promise.all(
    unread.map((notification) =>
      ctx.db.patch(notification._id, { read: true }),
    ),
  );
}
