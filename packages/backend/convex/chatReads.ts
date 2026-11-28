import { v } from "convex/values";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertMessageParentAccess, authMutation, authQuery } from "./functions";
import { chatTurnEntityIdValidator } from "./validators";
import type { ChatParentId } from "./_validators/tableFields";
import { sessionOwnerEntityId } from "./_sessions/owner";
import { expireRecap, maybeStartRecap } from "./chatRecaps";

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

/**
 * The chat's unread clock: its last activity in the main transcript, an Eva
 * turn finishing or a person posting. Undefined: nothing happened yet.
 */
export function lastChatActivityAt(entity: {
  lastTurnFinishedAt?: number;
  lastPersonMessageAt?: number;
}): number | undefined {
  const { lastTurnFinishedAt, lastPersonMessageAt } = entity;
  if (lastTurnFinishedAt === undefined) return lastPersonMessageAt;
  if (lastPersonMessageAt === undefined) return lastTurnFinishedAt;
  return Math.max(lastTurnFinishedAt, lastPersonMessageAt);
}

/**
 * A read row means the user opened, posted in or was mentioned in the chat,
 * so it counts like their own.
 */
export function computeHasUnread(input: {
  isOwn: boolean;
  hasReadRow: boolean;
  lastActivityAt: number | undefined;
  lastReadAt: number | undefined;
}): boolean {
  return (
    (input.isOwn || input.hasReadRow) &&
    input.lastActivityAt !== undefined &&
    input.lastActivityAt > (input.lastReadAt ?? 0)
  );
}

export function getReadRow(
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
  if (entity.repoId === undefined) return false;
  return computeHasUnread({
    isOwn: isOwnChat(userId, entity),
    hasReadRow: row !== null,
    lastActivityAt: lastChatActivityAt(entity),
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
    if (lastChatActivityAt(entity) === undefined) return false;
    const cached = byParent.get(String(entity._id));
    if (cached) return hasUnreadFor(userId, entity, cached);
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
  if (lastChatActivityAt(entity) === undefined) return false;
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

const VISIT_WRITE_INTERVAL_MS = 60_000;

async function upsertReadRow(
  ctx: MutationCtx,
  userId: Id<"users">,
  entity: ChatEntity,
  seen: boolean,
): Promise<void> {
  if (entity.repoId === undefined) return;
  const row = await getReadRow(ctx.db, userId, entity._id);
  const lastReadAt = Date.now();
  const activityAt = lastChatActivityAt(entity);
  if (!row) {
    await ctx.db.insert("chatReads", {
      userId,
      parentId: entity._id,
      repoId: entity.repoId,
      lastReadAt,
      ...(seen && activityAt !== undefined ? { seenNewAt: lastReadAt } : {}),
    });
    return;
  }
  if (row.lastReadAt >= (activityAt ?? 0)) return;
  await ctx.db.patch(row._id, {
    lastReadAt,
    repoId: entity.repoId,
    ...(seen ? { seenNewAt: lastReadAt } : {}),
  });
}

async function loadChatChain(
  db: DatabaseReader,
  parentId: ChatParentId,
): Promise<ChatEntity[]> {
  const chatId = db.normalizeId("sessionChats", parentId);
  const chat = chatId ? await db.get(chatId) : null;
  if (chatId && !chat) return [];
  const sessionId = chat ? chat.sessionId : db.normalizeId("sessions", parentId);
  const session = sessionId ? await db.get(sessionId) : null;
  const ownerId = session ? sessionOwnerEntityId(session) : undefined;
  const taskId = ownerId ? db.normalizeId("agentTasks", ownerId) : null;
  const projectId = ownerId ? db.normalizeId("projects", ownerId) : null;
  const owner = taskId
    ? await db.get(taskId)
    : projectId
      ? await db.get(projectId)
      : null;
  const chain: ChatEntity[] = [];
  for (const entity of [chat, session, owner]) {
    if (entity) chain.push(entity);
  }
  return chain;
}

type ChatActivity =
  | { lastTurnFinishedAt: number }
  | { lastPersonMessageAt: number };

/**
 * Moves a chat's unread clock (`lastChatActivityAt`) on the chat and every row
 * that shows its dot (`loadChatChain`). Returns those rows as patched.
 */
export async function stampChatActivity(
  ctx: MutationCtx,
  parentId: ChatParentId,
  activity: ChatActivity,
): Promise<ChatEntity[]> {
  const chain = await loadChatChain(ctx.db, parentId);
  await Promise.all(
    chain.map((entity) => ctx.db.patch(entity._id, activity)),
  );
  return chain.map((entity) => ({ ...entity, ...activity }));
}

/**
 * A person posted in a chat's main transcript (a thread reply is not one;
 * threads keep their own read state). The chat goes unread for its other
 * readers. The author has read it, and the author and each person the post
 * mentions become readers: a mentioned person reads from just before it, so
 * the post is their first new message.
 */
export async function recordPersonChatPost(
  ctx: MutationCtx,
  params: {
    parentId: ChatParentId;
    authorId: Id<"users">;
    mentionedIds: ReadonlyArray<Id<"users">>;
  },
): Promise<void> {
  const now = Date.now();
  const chain = await stampChatActivity(ctx, params.parentId, {
    lastPersonMessageAt: now,
  });
  const mentioned = params.mentionedIds.filter(
    (userId) => userId !== params.authorId,
  );
  const joinAsReader = async (userId: Id<"users">, entity: ChatEntity) => {
    const { repoId } = entity;
    if (repoId === undefined) return;
    const row = await getReadRow(ctx.db, userId, entity._id);
    if (row) {
      await markJoined(ctx, row, now);
      return;
    }
    await ctx.db.insert("chatReads", {
      userId,
      parentId: entity._id,
      repoId,
      lastReadAt: now - 1,
      joinedAt: now,
    });
  };
  const authorReads = async (entity: ChatEntity) => {
    await upsertReadRow(ctx, params.authorId, entity, false);
    const row = await getReadRow(ctx.db, params.authorId, entity._id);
    if (row) await markJoined(ctx, row, now);
  };
  await Promise.all(
    chain.flatMap((entity) => [
      authorReads(entity),
      ...mentioned.map((userId) => joinAsReader(userId, entity)),
    ]),
  );
}

async function markJoined(
  ctx: MutationCtx,
  row: Doc<"chatReads">,
  now: number,
): Promise<void> {
  if (row.joinedAt === undefined) await ctx.db.patch(row._id, { joinedAt: now });
}

/**
 * The open chat is still on screen (every few minutes) or just left it.
 * Moves only `lastVisitedAt`, so a recap measures the absence from when the
 * user left, not from when they opened the chat: watching a long turn is
 * not being away from it.
 */
export const touchVisit = authMutation({
  args: { parentId: chatTurnEntityIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const row = await getReadRow(ctx.db, ctx.userId, args.parentId);
    const now = Date.now();
    if (row && now - (row.lastVisitedAt ?? 0) > VISIT_WRITE_INTERVAL_MS) {
      await ctx.db.patch(row._id, { lastVisitedAt: now });
    }
    return null;
  },
});

export const markRead = authMutation({
  args: {
    parentId: chatTurnEntityIdValidator,
    opened: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const chain = await loadChatChain(ctx.db, args.parentId);
    const [entity] = chain;
    if (!entity) return null;
    const now = Date.now();
    const row = await getReadRow(ctx.db, ctx.userId, args.parentId);
    await Promise.all(
      chain.map((link) => upsertReadRow(ctx, ctx.userId, link, true)),
    );
    if (args.opened === true) await expireRecap(ctx, ctx.userId, args.parentId, now);
    if (row && args.opened === true) {
      await maybeStartRecap(ctx, {
        userId: ctx.userId,
        parentId: args.parentId,
        lastReadAt: row.lastReadAt,
        lastSeenAt: Math.max(row.lastReadAt, row.lastVisitedAt ?? 0),
        lastTurnFinishedAt: entity.lastTurnFinishedAt,
        now,
      });
    }
    if (row) {
      if (now - (row.lastVisitedAt ?? 0) > VISIT_WRITE_INTERVAL_MS) {
        await ctx.db.patch(row._id, { lastVisitedAt: now });
      }
    }
    return null;
  },
});
