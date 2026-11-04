import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Deletes a queued message's attachment blobs. A queued message owns its
 * uploads until a `messages` row takes them over, so every path that consumes
 * the row WITHOUT creating that message (user remove, a dequeue that fails
 * before the user message exists) must call this or the blobs leak in
 * `_storage` forever. The successful dequeue hands the ids on and must not.
 */
export async function reclaimQueuedAttachments(
  ctx: MutationCtx,
  queuedMessage: Pick<Doc<"queuedMessages">, "attachmentStorageIds">,
): Promise<void> {
  for (const storageId of queuedMessage.attachmentStorageIds ?? []) {
    await ctx.storage.delete(storageId);
  }
}
