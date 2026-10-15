import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authMutation, authAction } from "./functions";
import { messageFields } from "./_validators/tableFields";

/** Generates a temporary upload URL for storing screenshot/video files. */
export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Attaches uploaded media to an exact message, or the latest for legacy callbacks. */
export const attachMedia = authAction({
  args: {
    // Same union as `messages.parentId`: session turns send their chat id.
    parentId: messageFields.parentId,
    messageId: v.optional(v.id("messages")),
    imageStorageId: v.optional(v.id("_storage")),
    videoStorageId: v.optional(v.id("_storage")),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.messages.attachMediaInternal, {
      userId: ctx.userId,
      parentId: args.parentId,
      messageId: args.messageId,
      imageStorageId: args.imageStorageId,
      videoStorageId: args.videoStorageId,
      mediaStorageIds: args.mediaStorageIds,
    });
    return null;
  },
});
