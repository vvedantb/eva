import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { findOpenTurn } from "../_chat/turnStore";
import { findMainChat } from "../_sessionChats/helpers";
import { deleteChatRows } from "../_sessionChats/purge";

/**
 * One chat per session: deletes the chats a session opened beside its Main
 * chat, with everything that hangs off them. Run by
 * `dataMigrations:deleteExtraSessionChats`; once it has run, every
 * `sessionChats` row is a Main chat.
 */

/** Messages deleted per `purgeExtraSessionChat` run; tool output rows are heavy. */
const PURGE_MESSAGE_PAGE = 100;

/**
 * Whether the migration may delete this chat now. A Main chat stays; a chat
 * with a live agent turn is skipped (logged), so a rerun picks it up once the
 * turn has ended.
 */
export async function extraChatToDelete(
  ctx: MutationCtx,
  chat: Doc<"sessionChats">,
): Promise<boolean> {
  if (chat.isMain) return false;
  if (await findOpenTurn(ctx, chat._id)) {
    console.log(
      `[deleteExtraSessionChats] skipped chat=${chat._id} session=${chat.sessionId}: a turn is open`,
    );
    return false;
  }
  return true;
}

/** Deletes the thread follow rows of one page of the chat's messages. */
async function deleteThreadParticipants(
  ctx: MutationCtx,
  messages: ReadonlyArray<Doc<"messages">>,
): Promise<void> {
  for (const message of messages) {
    const rows = await ctx.db
      .query("threadParticipants")
      .withIndex("by_root", (q) => q.eq("rootId", message._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

/**
 * Rows keyed by user and chat. Read through the people who could have them:
 * the session's owner and the chat's creator (both indexed reads).
 */
async function deletePerUserRows(
  ctx: MutationCtx,
  chat: Doc<"sessionChats">,
): Promise<void> {
  const userIds = new Set([chat.userId]);
  if (chat.createdBy !== undefined) userIds.add(chat.createdBy);
  for (const userId of userIds) {
    const [drafts, reads, recaps] = await Promise.all([
      ctx.db
        .query("drafts")
        .withIndex("by_user_and_chat", (q) =>
          q.eq("userId", userId).eq("chatId", chat._id),
        )
        .collect(),
      ctx.db
        .query("chatReads")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentId", chat._id),
        )
        .collect(),
      ctx.db
        .query("chatRecaps")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentId", chat._id),
        )
        .collect(),
    ]);
    for (const row of [...drafts, ...reads, ...recaps]) {
      await ctx.db.delete(row._id);
    }
  }
}

/**
 * Docs and artifacts made in the chat stay: their inline card anchor moves
 * to the session's Main chat (null: no anchor).
 */
async function moveChatAnchors(
  ctx: MutationCtx,
  chatId: Id<"sessionChats">,
  mainChatId: Id<"sessionChats"> | undefined,
): Promise<void> {
  const [docs, artifacts] = await Promise.all([
    ctx.db
      .query("docs")
      .withIndex("by_chat_parent", (q) => q.eq("chatParentId", chatId))
      .collect(),
    ctx.db
      .query("artifacts")
      .withIndex("by_chat_parent", (q) => q.eq("chatParentId", chatId))
      .collect(),
  ]);
  for (const row of [...docs, ...artifacts]) {
    await ctx.db.patch(row._id, { chatParentId: mainChatId });
  }
}

/**
 * Deletes one extra chat a page at a time: its messages (and their thread
 * follow rows), then the queue, cards, closed turns, preview tool calls,
 * drafts, read markers and recaps, then the chat row. Reschedules itself
 * until done. Idempotent: a chat already gone is a no-op.
 */
export const purgeExtraSessionChat = internalMutation({
  args: { chatId: v.id("sessionChats") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || !(await extraChatToDelete(ctx, chat))) return null;
    const page = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
      .take(PURGE_MESSAGE_PAGE);
    await deleteThreadParticipants(ctx, page);
    const { done } = await deleteChatRows(ctx, chat._id, PURGE_MESSAGE_PAGE);
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.deleteExtraSessionChats.purgeExtraSessionChat,
        args,
      );
      return null;
    }
    const [previewCalls, mainChat] = await Promise.all([
      ctx.db
        .query("previewToolCalls")
        .withIndex("by_parent_status", (q) => q.eq("parentId", chat._id))
        .collect(),
      findMainChat(ctx.db, chat.sessionId),
    ]);
    for (const row of previewCalls) await ctx.db.delete(row._id);
    await deletePerUserRows(ctx, chat);
    await moveChatAnchors(ctx, chat._id, mainChat?._id);
    await ctx.db.delete(chat._id);
    console.log(
      `[deleteExtraSessionChats] deleted chat=${chat._id} session=${chat.sessionId}`,
    );
    return null;
  },
});
