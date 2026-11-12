import { v } from "convex/values";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertMessageParentAccess, authMutation, authQuery } from "./functions";
import { chatTurnEntityIdValidator } from "./validators";
import { chatOwnerEntityId } from "./_sessions/owner";

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

/**
 * Up to this many tasks, task enrichment reads each task's run summary and
 * chat read row by point lookup; longer lists read the user's whole repo once
 * (`unreadLookupForRepo`). Both give the same answer. Point reads for every
 * task lost here: 216 ms against 146 ms at 150 tasks, and at 1,500 tasks they
 * hit Convex's 4,096 reads per function (load test, 10 November 2026).
 */
export const POINT_READ_LIMIT = 50;

/**
 * Up to this many entities, `unreadLookupForList` reads one chat read row
 * each. It costs one read per row, so it stays well under the 4,096 reads a
 * function may make. The repo-wide read holds every session, task and project
 * row the user has in the repo, so a list of one kind paid for all three:
 * `projects.list` for 500 projects beside 3,000 sessions read 6,128 documents
 * in 1.8 s that way, and 753 documents in 313 ms by point reads (load test).
 */
const LIST_POINT_READ_LIMIT = 1_000;

/** Unread check for a list of `count` entities in one repo (see `LIST_POINT_READ_LIMIT`). */
export async function unreadLookupForList(
  db: DatabaseReader,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
  count: number,
): Promise<(entity: ChatEntity) => Promise<boolean>> {
  if (count <= LIST_POINT_READ_LIMIT) {
    return (entity) => hasUnreadByPointRead(db, userId, entity);
  }
  return unreadLookupForRepo(db, userId, repoId);
}

/**
 * One-row variant of `unreadLookupForRepo` for short lists: a point read
 * instead of the user's whole repo. It ignores a read row filed under another
 * repo, exactly as the repo-wide lookup does, so both give the same answer.
 */
export async function hasUnreadByPointRead(
  db: DatabaseReader,
  userId: Id<"users">,
  entity: ChatEntity,
): Promise<boolean> {
  if (entity.lastTurnFinishedAt === undefined) return false;
  const row = await getReadRow(db, userId, entity._id);
  return hasUnreadFor(
    userId,
    entity,
    row !== null && row.repoId === entity.repoId ? row : null,
  );
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

/** Upserts the user's read row for one chat entity, skipping repeat calls past its watermark. */
async function upsertReadRow(
  ctx: MutationCtx,
  userId: Id<"users">,
  entity: ChatEntity,
): Promise<void> {
  // A task with no repo is never unread (see `hasUnreadFor`); nothing to store.
  if (entity.repoId === undefined) return;
  const row = await getReadRow(ctx.db, userId, entity._id);
  const lastReadAt = Date.now();
  if (!row) {
    await ctx.db.insert("chatReads", {
      userId,
      parentId: entity._id,
      repoId: entity.repoId,
      lastReadAt,
    });
    return;
  }
  // Already past the watermark: skip, so repeat calls on mount do not churn.
  if (row.lastReadAt >= (entity.lastTurnFinishedAt ?? 0)) return;
  await ctx.db.patch(row._id, { lastReadAt, repoId: entity.repoId });
}

export const markRead = authMutation({
  args: { parentId: chatTurnEntityIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const entity = await ctx.db.get(args.parentId);
    if (!entity) return null;
    await upsertReadRow(ctx, ctx.userId, entity);
    // The sidebar keys a session's unread dot by the session id, so reading
    // one of its chats also reads the session.
    const chatId = ctx.db.normalizeId("sessionChats", args.parentId);
    const chat = chatId ? await ctx.db.get(chatId) : null;
    const session = chat ? await ctx.db.get(chat.sessionId) : null;
    if (session) await upsertReadRow(ctx, ctx.userId, session);
    // A task's or project's session shows its unread dot on the owner's card;
    // a project task's own chat on that task's.
    const ownerId =
      chat && session ? chatOwnerEntityId(chat, session) : undefined;
    const taskId = ownerId ? ctx.db.normalizeId("agentTasks", ownerId) : null;
    const projectId = ownerId ? ctx.db.normalizeId("projects", ownerId) : null;
    const owner = taskId
      ? await ctx.db.get(taskId)
      : projectId
        ? await ctx.db.get(projectId)
        : null;
    if (owner) await upsertReadRow(ctx, ctx.userId, owner);
    return null;
  },
});
