import { v } from "convex/values";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertMessageParentAccess, authMutation, authQuery } from "./functions";
import { chatTurnEntityIdValidator } from "./validators";

type ChatEntityId =
  | Id<"sessionChats">
  | Id<"sessions">
  | Id<"agentTasks">
  | Id<"projects">;
type ChatEntity =
  | Doc<"sessionChats">
  | Doc<"sessions">
  | Doc<"agentTasks">
  | Doc<"projects">;

/** Chats the user "owns": creator, owner or project member. Shared chats they never opened stay quiet. */
export function isOwnChat(
  userId: Id<"users">,
  entity: {
    userId?: Id<"users">;
    createdBy?: Id<"users">;
    members?: ReadonlyArray<Id<"users">>;
  },
): boolean {
  return (
    entity.userId === userId ||
    entity.createdBy === userId ||
    (entity.members?.includes(userId) ?? false)
  );
}

/** A read row means the user opened the chat once, so it counts like their own. */
export function computeHasUnread(input: {
  isOwn: boolean;
  hasReadRow: boolean;
  lastTurnFinishedAt: number | undefined;
  lastReadAt: number | undefined;
}): boolean {
  return (
    (input.isOwn || input.hasReadRow) &&
    input.lastTurnFinishedAt !== undefined &&
    input.lastTurnFinishedAt > (input.lastReadAt ?? 0)
  );
}

function getReadRow(
  db: DatabaseReader,
  userId: Id<"users">,
  parentId: ChatEntityId,
): Promise<Doc<"chatReads"> | null> {
  return db
    .query("chatReads")
    .withIndex("by_user_parent", (q) =>
      q.eq("userId", userId).eq("parentId", parentId),
    )
    .unique();
}

function hasUnreadFor(
  userId: Id<"users">,
  entity: ChatEntity,
  row: Doc<"chatReads"> | null,
): boolean {
  // `chatReads.repoId` is required, so a task with no repo can never be marked
  // read. Keep it quiet rather than lit forever.
  if (entity.repoId === undefined) return false;
  return computeHasUnread({
    isOwn: isOwnChat(userId, entity),
    hasReadRow: row !== null,
    lastTurnFinishedAt: entity.lastTurnFinishedAt,
    lastReadAt: row?.lastReadAt,
  });
}

/** One indexed read per list subscription, then an in-memory join. Linked sessions from other repos fall back to a point read. */
export async function unreadLookupForRepo(
  db: DatabaseReader,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
): Promise<(entity: ChatEntity) => Promise<boolean>> {
  const rows = await db
    .query("chatReads")
    .withIndex("by_user_repo", (q) =>
      q.eq("userId", userId).eq("repoId", repoId),
    )
    .collect();
  const byParent = new Map(rows.map((row) => [String(row.parentId), row]));
  return async (entity) => {
    // A chat that never finished a turn cannot be unread; skip the point read.
    if (entity.lastTurnFinishedAt === undefined) return false;
    const cached = byParent.get(String(entity._id));
    if (cached) return hasUnreadFor(userId, entity, cached);
    // Same-repo misses have no row by construction; only linked sessions from
    // other repos need the point read.
    if (entity.repoId === undefined || entity.repoId === repoId) {
      return hasUnreadFor(userId, entity, null);
    }
    return hasUnreadFor(
      userId,
      entity,
      await getReadRow(db, userId, entity._id),
    );
  };
}

/** Unread state of the open chat, plus the read time the "NEW" divider anchors on. */
export const isUnread = authQuery({
  args: { parentId: chatTurnEntityIdValidator },
  returns: v.object({
    hasUnread: v.boolean(),
    lastReadAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const entity = await ctx.db.get(args.parentId);
    if (!entity) return { hasUnread: false };
    const row = await getReadRow(ctx.db, ctx.userId, args.parentId);
    return {
      hasUnread: hasUnreadFor(ctx.userId, entity, row),
      lastReadAt: row?.lastReadAt,
    };
  },
});

export const markRead = authMutation({
  args: { parentId: chatTurnEntityIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const entity = await ctx.db.get(args.parentId);
    if (!entity) return null;
    // A task with no repo is never unread (see `hasUnreadFor`); nothing to store.
    if (entity.repoId === undefined) return null;
    const row = await getReadRow(ctx.db, ctx.userId, args.parentId);
    const lastReadAt = Date.now();
    if (!row) {
      await ctx.db.insert("chatReads", {
        userId: ctx.userId,
        parentId: args.parentId,
        repoId: entity.repoId,
        lastReadAt,
      });
      return null;
    }
    // Already past the watermark: skip, so repeat calls on mount do not churn.
    if (row.lastReadAt >= (entity.lastTurnFinishedAt ?? 0)) return null;
    await ctx.db.patch(row._id, { lastReadAt, repoId: entity.repoId });
    return null;
  },
});
