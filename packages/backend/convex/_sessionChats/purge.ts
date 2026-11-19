import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type ChatRowsParentId = Id<"sessions"> | Id<"sessionChats">;

/** Messages deleted per run of `purgeDeletedChat`; tool output rows are heavy. */
const PURGE_MESSAGE_PAGE = 100;

/** Deletes the chat's queued sends, so none can start a turn on it. */
export async function deleteQueuedMessages(
  ctx: MutationCtx,
  parentId: ChatRowsParentId,
): Promise<number> {
  const queued = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", parentId))
    .collect();
  for (const row of queued) await ctx.db.delete(row._id);
  return queued.length;
}

/**
 * Deletes the transcript, queue, inline cards and closed turns of one session
 * chat parent. With `messageLimit`, deletes at most that many messages and
 * reports `done: false` while more are left; the small tables go in the last
 * page.
 */
export async function deleteChatRows(
  ctx: MutationCtx,
  parentId: ChatRowsParentId,
  messageLimit?: number,
): Promise<{ deleted: number; done: boolean }> {
  let deleted = await deleteQueuedMessages(ctx, parentId);
  const messageQuery = ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId));
  const messages =
    messageLimit === undefined
      ? await messageQuery.collect()
      : await messageQuery.take(messageLimit);
  for (const row of messages) await ctx.db.delete(row._id);
  deleted += messages.length;
  if (messageLimit !== undefined && messages.length === messageLimit) {
    return { deleted, done: false };
  }
  const panels = await ctx.db
    .query("chatUiPanels")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();
  for (const row of panels) await ctx.db.delete(row._id);
  deleted += panels.length;
  const renders = await ctx.db
    .query("chatHtmlRenders")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();
  for (const row of renders) {
    if (await ctx.db.get(row.bodyId)) {
      await ctx.db.delete(row.bodyId);
      deleted++;
    }
    await ctx.db.delete(row._id);
  }
  deleted += renders.length;
  const envRequests = await ctx.db
    .query("envVarRequests")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();
  for (const row of envRequests) await ctx.db.delete(row._id);
  deleted += envRequests.length;
  const proposals = await ctx.db
    .query("sessionProposals")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();
  for (const row of proposals) await ctx.db.delete(row._id);
  deleted += proposals.length;
  // Closed turns only: an open turn still has a live agent behind it.
  const turns = await ctx.db
    .query("turns")
    .withIndex("by_entity_open", (q) => q.eq("entityId", parentId))
    .filter((q) => q.eq(q.field("open"), false))
    .collect();
  for (const row of turns) await ctx.db.delete(row._id);
  deleted += turns.length;
  return { deleted, done: true };
}

/**
 * Continuation of `sessionChats.remove`: deletes the hidden chat's rows one
 * page at a time. The archived chat row stays as a tombstone: it holds its
 * `number`, so an old `?chat=N` link never opens a newer tab.
 */
export const purgeDeletedChat = internalMutation({
  args: { chatId: v.id("sessionChats") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { done } = await deleteChatRows(ctx, args.chatId, PURGE_MESSAGE_PAGE);
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal._sessionChats.purge.purgeDeletedChat,
        args,
      );
    }
    return null;
  },
});
