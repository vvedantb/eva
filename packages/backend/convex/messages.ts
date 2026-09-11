import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertMessageParentAccess,
  authQuery,
  authMutation,
} from "./functions";
import { variationValidator, messageFields } from "./validators";
import {
  appendMediaStorageIds,
  messageMediaStorageIds,
  messageNeedsUrlResolution,
} from "./_messages/media";
import { resolveStorageEntries } from "./_chat/storageUrls";

const parentIdValidator = messageFields.parentId;

const messageValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  ...messageFields,
  // Resolved agent media (recordings/screenshots), in capture order.
  media: v.optional(
    v.array(
      v.object({
        url: v.union(v.string(), v.null()),
        contentType: v.union(v.string(), v.null()),
      }),
    ),
  ),
  // Resolved URLs for user-attached input files, in the same order as
  // attachmentStorageIds. Entries that fail to resolve are null.
  attachmentUrls: v.optional(v.array(v.union(v.string(), v.null()))),
  // Parallel metadata for rendering (image thumb vs file chip).
  attachments: v.optional(
    v.array(
      v.object({
        url: v.union(v.string(), v.null()),
        contentType: v.union(v.string(), v.null()),
      }),
    ),
  ),
});

/** Temporary upload URL for a composer image attachment (client POSTs the file, then sends the message). */
export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/** Fetches messages for a parent and resolves their image/video/attachment storage URLs. */
async function resolveMessageUrls(
  ctx: Pick<QueryCtx, "db" | "storage">,
  parentId: typeof parentIdValidator.type,
) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();
  if (!messages.some(messageNeedsUrlResolution)) {
    return messages;
  }
  return Promise.all(
    messages.map(async (m) => {
      if (!messageNeedsUrlResolution(m)) {
        return m;
      }
      const attachmentEntries = m.attachmentStorageIds
        ? await resolveStorageEntries(
            (id) => ctx.storage.getUrl(id),
            (id) => ctx.storage.getMetadata(id),
            m.attachmentStorageIds,
          )
        : undefined;
      const mediaIds = messageMediaStorageIds(m);
      const mediaEntries =
        mediaIds.length > 0
          ? await resolveStorageEntries(
              (id) => ctx.storage.getUrl(id),
              (id) => ctx.storage.getMetadata(id),
              mediaIds,
            )
          : undefined;
      return {
        ...m,
        media: mediaEntries?.map((entry) => ({
          url: entry.url,
          contentType: entry.contentType,
        })),
        attachmentUrls: attachmentEntries
          ? attachmentEntries.map((entry) => entry.url)
          : undefined,
        attachments: attachmentEntries?.map((entry) => ({
          url: entry.url,
          contentType: entry.contentType,
        })),
      };
    }),
  );
}

/** Lists all messages for a parent entity (session, doc, etc.) with resolved media URLs. */
export const listByParent = authQuery({
  args: { parentId: parentIdValidator },
  returns: v.array(messageValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    return await resolveMessageUrls(ctx, args.parentId);
  },
});

/** Updates an exact message when supplied, otherwise the latest legacy target. */
export const updateLastInternal = internalMutation({
  args: {
    parentId: parentIdValidator,
    messageId: v.optional(v.id("messages")),
    content: v.optional(v.string()),
    activityLog: v.optional(v.string()),
    variations: v.optional(v.array(variationValidator)),
    // Legacy single-media args: stale callback bundles still in flight during
    // a deploy call with these instead of mediaStorageIds. New callers use
    // mediaStorageIds.
    imageStorageId: v.optional(v.id("_storage")),
    videoStorageId: v.optional(v.id("_storage")),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = args.messageId
      ? await ctx.db.get(args.messageId)
      : await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
          .order("desc")
          .first();
    if (!target || target.parentId !== args.parentId) return null;

    const patch: {
      content?: string;
      activityLog?: string;
      variations?: (typeof variationValidator.type)[];
      mediaStorageIds?: Id<"_storage">[];
    } = {};
    if (args.content !== undefined) patch.content = args.content;
    if (args.activityLog !== undefined) patch.activityLog = args.activityLog;
    if (args.variations !== undefined) patch.variations = args.variations;

    // Accumulates within a turn, so a second capture cannot orphan the first.
    const mediaStorageIds = appendMediaStorageIds(target.mediaStorageIds, args);
    if (mediaStorageIds !== undefined) {
      patch.mediaStorageIds = mediaStorageIds;
    }

    await ctx.db.patch(target._id, patch);
    return null;
  },
});
