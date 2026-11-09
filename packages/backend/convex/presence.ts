import { components } from "./_generated/api";
import { v } from "convex/values";
import { mutation, type QueryCtx } from "./_generated/server";
import { Presence } from "@convex-dev/presence";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import {
  authQuery,
  authMutation,
  assertMessageParentAccess,
  getTaskWithAccess,
  hasRepoAccess,
} from "./functions";
import { getCurrentUserId } from "./_auth/currentUser";
import { findDocWithAccess } from "./_docs/access";
import {
  getUserPresenceRow,
  shouldWriteLastSeenAt,
  upsertUserPresence,
} from "./_users/lastSeen";

const presence = new Presence(components.presence);

/**
 * The presence user id of one user online in `roomId`, or null when nobody is.
 * Server-side helper for sweeps (no room token needed); never expose it
 * directly to clients.
 */
export async function firstPresentUserInRoom(
  ctx: QueryCtx,
  roomId: string,
): Promise<string | null> {
  const members = await presence.listRoom(ctx, roomId, true, 1);
  return members[0]?.userId ?? null;
}

/** Must match ClientProvider's usePresence room — the only heartbeat that owns lastSeenAt. */
const LAST_SEEN_ROOM_ID = "platform";

/**
 * Throws unless the user may join a `doc:` or `typing:` room: those rooms show
 * who is present and typing on one entity, so they follow that entity's access
 * rule. Room ids are built by the web app (`DocPresenceFacepile`,
 * `ChatComposer`, `TaskActivityComposerForm`, `CommentReplyComposer`). Other
 * rooms (`platform`, `sandbox:`, `cursor:`) are not checked here.
 */
async function assertPresenceRoomAccess(
  db: GenericDatabaseReader<DataModel>,
  roomId: string,
  userId: Id<"users">,
): Promise<void> {
  const [kind, ...rest] = roomId.split(":");
  const key = rest.join(":");
  if (kind === "doc") {
    const docId = db.normalizeId("docs", key);
    if (docId && (await findDocWithAccess(db, docId, userId))) return;
    throw new Error("Not authorized");
  }
  if (kind !== "typing") return;

  const [target, ...idParts] = rest;
  const id = idParts.join(":");
  if (target === "task") {
    const taskId = db.normalizeId("agentTasks", id);
    if (!taskId) throw new Error("Not authorized");
    await getTaskWithAccess(db, taskId, userId);
    return;
  }
  if (target === "task-comment") {
    const commentId = db.normalizeId("taskComments", id);
    const comment = commentId ? await db.get(commentId) : null;
    if (!comment) throw new Error("Not authorized");
    await getTaskWithAccess(db, comment.taskId, userId);
    return;
  }
  if (target === "chat") {
    await assertChatRoomAccess(db, id, userId);
    return;
  }
  throw new Error("Not authorized");
}

/** `typing:chat:<conversationId>`, where the id is whatever `ChatBody` keys the chat on. */
async function assertChatRoomAccess(
  db: GenericDatabaseReader<DataModel>,
  conversationId: string,
  userId: Id<"users">,
): Promise<void> {
  // A fresh Ave chat before its thread exists (useAveChat). Ave is per user.
  if (conversationId === "ave") return;
  const NEW_SESSION_PREFIX = "new-session-";
  if (conversationId.startsWith(NEW_SESSION_PREFIX)) {
    const repoId = db.normalizeId(
      "githubRepos",
      conversationId.slice(NEW_SESSION_PREFIX.length),
    );
    if (repoId && (await hasRepoAccess(db, repoId, userId))) return;
    throw new Error("Not authorized");
  }
  const threadId = db.normalizeId("aveThreads", conversationId);
  if (threadId) {
    const thread = await db.get(threadId);
    if (thread?.userId === userId) return;
    throw new Error("Not authorized");
  }
  // Session chats, task chats and project chats.
  await assertMessageParentAccess(db, conversationId, userId);
}

/**
 * True for an app-internal path: starts with one `/`, no backslash, no control
 * characters. FollowOverlay navigates a follower's client to this value.
 * TODO: replace with `@eva/shared/safeUrl.isInternalAppHref` once PR #1153 lands.
 */
function isAppInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** Sends a presence heartbeat for the current user in a room, updating lastSeenAt periodically. */
export const heartbeat = authMutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    if (userId !== ctx.userId) {
      throw new Error("Cannot send heartbeat for another user");
    }
    await assertPresenceRoomAccess(ctx.db, roomId, ctx.userId);
    const result = await presence.heartbeat(
      ctx,
      roomId,
      userId,
      sessionId,
      interval,
    );
    // Cursor/typing rooms also heartbeat this mutation. Reading users from
    // those rooms put lastSeenAt writes in every room's conflict set (30 OCC
    // in 72h on one user doc). Only the app-wide room owns lastSeenAt.
    if (roomId === LAST_SEEN_ROOM_ID) {
      const row = await getUserPresenceRow(ctx.db, ctx.userId);
      if (shouldWriteLastSeenAt(row?.lastSeenAt, Date.now())) {
        await upsertUserPresence(ctx.db, ctx.userId, {
          lastSeenAt: Date.now(),
        });
      }
    }
    return result;
  },
});

/** Updates the current page path for the user, shown to teammates in the sidebar. */
export const updatePath = authMutation({
  args: { path: v.string() },
  returns: v.null(),
  handler: async (ctx, { path }) => {
    if (!isAppInternalPath(path)) throw new Error("Invalid path");
    const row = await getUserPresenceRow(ctx.db, ctx.userId);
    if (row?.lastSeenPath !== path) {
      await upsertUserPresence(ctx.db, ctx.userId, { lastSeenPath: path });
    }
    return null;
  },
});

/** Lists all currently present users in a room. */
export const list = authQuery({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

/** Disconnects a user's session from a room. */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;
    await presence.disconnect(ctx, sessionToken);
    return null;
  },
});

/** Updates the current user's cursor position and display info in a room. */
export const updateCursor = authMutation({
  args: {
    roomId: v.string(),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, { roomId, x, y }) => {
    const user = await ctx.db.get(ctx.userId);
    if (!user) return;
    await presence.updateRoomUser(ctx, roomId, ctx.userId, {
      x,
      y,
      firstName: user.firstName ?? user.fullName ?? "User",
      accentColor: user.customTheme?.accentColor ?? "zinc",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Flags whether the current user is typing in a room, broadcasting their name
 * so teammates can show a "X is typing" indicator. Stored on the ephemeral
 * presence record (not the DB), so it auto-clears when the user goes offline.
 */
export const updateTyping = authMutation({
  args: {
    roomId: v.string(),
    isTyping: v.boolean(),
  },
  handler: async (ctx, { roomId, isTyping }) => {
    await assertPresenceRoomAccess(ctx.db, roomId, ctx.userId);
    const user = await ctx.db.get(ctx.userId);
    if (!user) return;
    await presence.updateRoomUser(ctx, roomId, ctx.userId, {
      isTyping,
      firstName: user.firstName ?? user.fullName ?? "User",
    });
  },
});
