import { components } from "./_generated/api";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { Presence } from "@convex-dev/presence";
import { authQuery, authMutation } from "./functions";
import { getCurrentUserId } from "./_auth/currentUser";
import {
  getUserPresenceRow,
  shouldWriteLastSeenAt,
  upsertUserPresence,
} from "./_users/lastSeen";

const presence = new Presence(components.presence);

/** Must match ClientProvider's usePresence room — the only heartbeat that owns lastSeenAt. */
const LAST_SEEN_ROOM_ID = "platform";

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
    const user = await ctx.db.get(ctx.userId);
    if (!user) return;
    await presence.updateRoomUser(ctx, roomId, ctx.userId, {
      isTyping,
      firstName: user.firstName ?? user.fullName ?? "User",
    });
  },
});
