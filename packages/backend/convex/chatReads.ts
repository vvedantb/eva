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
    // A chat with no activity cannot be unread; skip the point read.
    if (lastChatActivityAt(entity) === undefined) return false;
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

/** `lastVisitedAt` moves at most this often; recaps need minutes, not seconds. */
const VISIT_WRITE_INTERVAL_MS = 60_000;

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
  if (row.lastReadAt >= (lastChatActivityAt(entity) ?? 0)) return;
  await ctx.db.patch(row._id, { lastReadAt, repoId: entity.repoId });
}

/**
 * A chat, parent first, then the rows whose cards show its unread dot: its
 * session (the sidebar keys a session's dot by the session) and the session's
 * task or project. Empty when the chat is gone.
 */
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

/** One kind of chat activity, with its time: what moves the unread clock. */
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
    if (await getReadRow(ctx.db, userId, entity._id)) return;
    await ctx.db.insert("chatReads", {
      userId,
      parentId: entity._id,
      repoId,
      lastReadAt: now - 1,
    });
  };
  await Promise.all(
    chain.flatMap((entity) => [
      upsertReadRow(ctx, params.authorId, entity),
      ...mentioned.map((userId) => joinAsReader(userId, entity)),
    ]),
  );
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
    /** The chat just came on screen (not a reply landing while it was). */
    opened: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const chain = await loadChatChain(ctx.db, args.parentId);
    const [entity] = chain;
    if (!entity) return null;
    const now = Date.now();
    // Read before the upsert moves it. A first open (no row) has no absence.
    const row = await getReadRow(ctx.db, ctx.userId, args.parentId);
    // Reading a chat also reads the rows that show its dot (`loadChatChain`).
    await Promise.all(
      chain.map((link) => upsertReadRow(ctx, ctx.userId, link)),
    );
    // Recaps belong to one visit: an open expires the last one, then may
    // write a new one. A reply landing while the chat is watched does neither.
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
      // Throttled: the client marks on every open and every landed reply,
      // and `touchVisit` keeps it fresh while the chat stays on screen.
      if (now - (row.lastVisitedAt ?? 0) > VISIT_WRITE_INTERVAL_MS) {
        await ctx.db.patch(row._id, { lastVisitedAt: now });
      }
    }
    return null;
  },
});
