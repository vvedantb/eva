import { v } from "convex/values";
import {
  authMutation,
  authQuery,
  assertMessageParentAccess,
} from "./functions";
import { queuedMessageFields } from "./validators";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";

const parentIdValidator = queuedMessageFields.parentId;

const queuedMessageValidator = v.object({
  _id: v.id("queuedMessages"),
  _creationTime: v.number(),
  ...queuedMessageFields,
});

/** Lists queued messages for a parent entity, ordered by run order. */
export const listByParent = authQuery({
  args: { parentId: parentIdValidator },
  returns: v.array(queuedMessageValidator),
  handler: async (ctx, args) => {
    try {
      await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    } catch {
      return [];
    }
    return await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", args.parentId))
      .order("asc")
      .collect();
  },
});

/** Updates the content of a queued message. */
export const update = authMutation({
  args: {
    id: v.id("queuedMessages"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const queuedMessage = await ctx.db.get(args.id);
    if (!queuedMessage) {
      throw new Error("Queued message not found");
    }
    await assertMessageParentAccess(
      ctx.db,
      queuedMessage.parentId,
      ctx.userId,
    );
    if (queuedMessage.userId !== ctx.userId) {
      throw new Error("Not authorized");
    }

    const content = args.content.trim();
    if (!content) {
      throw new Error("Queued message cannot be empty");
    }

    // Editing a queued annotation degrades it to a plain message.
    await ctx.db.patch(args.id, { content, displayContent: undefined });
    await ctx.db.patch(queuedMessage.parentId, { updatedAt: Date.now() });
    return null;
  },
});

/**
 * Deletes a queued message, its attached blobs, and updates the parent's
 * timestamp. The blobs are safe to delete because a queued message's
 * attachments are uploaded for that message alone, and dequeuing hands the same
 * ids to the `messages` row without going through here (see `_queues/helpers`).
 */
export const remove = authMutation({
  args: {
    id: v.id("queuedMessages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const queuedMessage = await ctx.db.get(args.id);
    if (!queuedMessage) {
      return null;
    }
    try {
      await assertMessageParentAccess(
        ctx.db,
        queuedMessage.parentId,
        ctx.userId,
      );
    } catch {
      throw new Error("Not authorized");
    }
    if (queuedMessage.userId !== ctx.userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.id);
    for (const storageId of queuedMessage.attachmentStorageIds ?? []) {
      await ctx.storage.delete(storageId);
    }
    await ctx.db.patch(queuedMessage.parentId, { updatedAt: Date.now() });
    return null;
  },
});

/**
 * Rewrites the run order of a parent's queued messages. `orderedIds` is the
 * desired top-to-bottom order; each message's `order` is set to its 0-based
 * position. A later enqueue uses Date.now() (far larger), so newly queued
 * messages always land after a reordered set.
 */
export const reorder = authMutation({
  args: {
    parentId: parentIdValidator,
    orderedIds: v.array(v.id("queuedMessages")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);

    let index = 0;
    for (const id of args.orderedIds) {
      const queuedMessage = await ctx.db.get(id);
      if (!queuedMessage || queuedMessage.parentId !== args.parentId) {
        throw new Error("Queued message does not belong to this parent");
      }
      await ctx.db.patch(id, { order: index });
      index += 1;
    }
    await ctx.db.patch(args.parentId, { updatedAt: Date.now() });
    return null;
  },
});
