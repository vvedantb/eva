import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { authQuery, hasRepoAccess } from "../functions";
import { sessionValidator } from "../_sessions/helpers";
import {
  findChatByNumber,
  findMainChat,
  listSessionChats,
  loadSessionChat,
  sessionChatValidator,
} from "./helpers";

/** Chats of one session in tab order (Main first), closed ones included so a link to one still resolves. */
export const listForSession = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(sessionChatValidator),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return [];
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return [];
    const chats = await listSessionChats(ctx.db, args.sessionId);
    return chats.toSorted((a, b) => a.number - b.number);
  },
});

/**
 * Every open chat beyond Main across a repo, for the sidebar's indented rows.
 * One subscription per repo group rather than one per session row.
 */
export const listExtraForRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(sessionChatValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const chats = await ctx.db
      .query("sessionChats")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .collect();
    return chats
      .filter((chat) => !chat.isMain && chat.archived !== true)
      .toSorted((a, b) => a.number - b.number);
  },
});

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
 * Resolves the chat a session link opens: `?chat=N`, or Main when the param
 * is absent. Null when the session has no Main chat yet — the page then calls
 * `ensureMain` and this query re-fires.
 */
export const resolveForSession = authQuery({
  args: {
    sessionId: v.id("sessions"),
    number: v.optional(v.number()),
  },
  returns: v.union(sessionChatValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    const requested =
      args.number !== undefined
        ? await findChatByNumber(ctx.db, args.sessionId, args.number)
        : null;
    return requested ?? (await findMainChat(ctx.db, args.sessionId));
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
  title: v.string(),
  number: v.number(),
  activeWorkflowId: v.optional(v.string()),
  lastModel: v.optional(v.string()),
});

function pickDeliveryChat(
  chats: Doc<"sessionChats">[],
  chat: string | undefined,
): Doc<"sessionChats"> | null {
  const live = chats.filter((candidate) => candidate.archived !== true);
  if (chat === undefined) {
    return live.find((candidate) => candidate.isMain) ?? live[0] ?? null;
  }
  const asNumber = Number(chat);
  if (Number.isInteger(asNumber)) {
    const byNumber = live.find((candidate) => candidate.number === asNumber);
    if (byNumber) return byNumber;
  }
  const wanted = chat.trim().toLowerCase();
  return (
    live.find((candidate) => candidate.title.trim().toLowerCase() === wanted) ??
    null
  );
}

/**
 * Which chat of a session an outside message (`send_chat_message`) lands in:
 * the named chat (number or exact title) or Main. Runs as the sending user.
 */
export const resolveDeliveryChat = authQuery({
  args: {
    sessionId: v.id("sessions"),
    chat: v.optional(v.string()),
  },
  returns: v.union(deliveryChatValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    const chats = await listSessionChats(ctx.db, args.sessionId);
    const chat = pickDeliveryChat(chats, args.chat);
    if (!chat) return null;
    return {
      chatId: chat._id,
      title: chat.title,
      number: chat.number,
      activeWorkflowId: chat.activeWorkflowId,
      lastModel: chat.lastModel,
    };
  },
});

export type DeliveryChat = {
  chatId: Id<"sessionChats">;
  title: string;
  number: number;
  activeWorkflowId?: string;
  lastModel?: string;
};
