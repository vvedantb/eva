import { components } from "./_generated/api";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { Presence } from "@convex-dev/presence";
import { authQuery, authMutation, hasRepoAccess } from "./functions";
import { assertEntityAccess, hasTaskAccess } from "./_auth/entityAccess";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { getCurrentUserId } from "./_auth/currentUser";
import {
  getUserPresenceRow,
  shouldWriteLastSeenAt,
  upsertUserPresence,
} from "./_users/lastSeen";

const presence = new Presence(components.presence);

/** Must match ClientProvider's usePresence room — the only heartbeat that owns lastSeenAt. */
const LAST_SEEN_ROOM_ID = "platform";

async function assertPresenceRoomAccess(
  db: GenericDatabaseReader<DataModel>,
  roomId: string,
  userId: Id<"users">,
): Promise<void> {
  if (roomId === LAST_SEEN_ROOM_ID) return;

  if (roomId.startsWith("doc:")) {
    await assertEntityAccess(db, roomId.slice("doc:".length), userId);
    return;
  }
  if (roomId.startsWith("typing:chat:")) {
    await assertEntityAccess(db, roomId.slice("typing:chat:".length), userId);
    return;
  }
  if (roomId.startsWith("typing:task:")) {
    await assertEntityAccess(db, roomId.slice("typing:task:".length), userId);
    return;
  }
  if (roomId.startsWith("typing:task-comment:")) {
    const raw = roomId.slice("typing:task-comment:".length);
    const commentId = db.normalizeId("taskComments", raw);
    if (commentId) {
      const comment = await db.get(commentId);
      if (!comment) throw new Error("Not authorized");
      const task = await db.get(comment.taskId);
      if (!task || !(await hasTaskAccess(db, task, userId))) {
        throw new Error("Not authorized");
      }
      return;
    }
    await assertEntityAccess(db, raw, userId);
    return;
  }
  if (roomId.startsWith("cursor:")) {
    const parts = roomId.slice("cursor:".length).split("/").filter(Boolean);
    if (parts.length < 2) return;
    const owner = parts[0];
    const name = parts[1];
    if (owner === undefined || name === undefined) return;
    const repo = await db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", owner).eq("name", name),
      )
      .first();
    if (repo && !(await hasRepoAccess(db, repo._id, userId))) {
      throw new Error("Not authorized");
    }
    return;
  }

  throw new Error("Not authorized");
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
    await assertPresenceRoomAccess(ctx.db, roomId, ctx.userId);
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
