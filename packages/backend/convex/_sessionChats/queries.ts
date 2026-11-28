import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { authQuery, hasRepoAccess } from "../functions";
import { sessionValidator } from "../_sessions/helpers";
import {
  findMainChat,
  loadSessionChat,
  sessionChatValidator,
} from "./helpers";

export const get = authQuery({
  args: { chatId: v.id("sessionChats") },
  returns: v.union(sessionChatValidator, v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return null;
    if (!(await hasRepoAccess(ctx.db, chat.repoId, ctx.userId))) return null;
    return chat;
  },
});

/**
 * A session's one chat (Main). Null when the session has no Main chat yet:
 * the page then calls `ensureMain` and this query re-fires.
 */
export const resolveForSession = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(sessionChatValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    return await findMainChat(ctx.db, args.sessionId);
  },
});

/** Chat + session for daemon launch and MCP delivery (no auth; internal callers). */
export const getInternal = internalQuery({
  args: { chatId: v.string() },
  returns: v.union(
    v.object({ chat: sessionChatValidator, session: sessionValidator }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const chatId = ctx.db.normalizeId("sessionChats", args.chatId);
    if (!chatId) return null;
    return await loadSessionChat(ctx.db, chatId);
  },
});

const deliveryChatValidator = v.object({
  chatId: v.id("sessionChats"),
  lastModel: v.optional(v.string()),
});

/**
 * The chat an outside message (`send_chat_message`) lands in: the session's
 * one chat. Runs as the sending user.
 */
export const resolveDeliveryChat = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(deliveryChatValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    const chat = await findMainChat(ctx.db, args.sessionId);
    if (!chat) return null;
    return { chatId: chat._id, lastModel: chat.lastModel };
  },
});

export type DeliveryChat = {
  chatId: Id<"sessionChats">;
  lastModel?: string;
};
