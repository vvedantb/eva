import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { authMutation, authAction } from "./functions";
import { requireSandboxCaller } from "./_auth/sandboxIdentity";

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
    parentId: v.union(v.id("sessions"), v.id("projects"), v.id("agentTasks")),
    messageId: v.optional(v.id("messages")),
    imageStorageId: v.optional(v.id("_storage")),
    videoStorageId: v.optional(v.id("_storage")),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSandboxCaller(ctx);
    await ctx.runQuery(api.messages.assertParentAccess, {
      parentId: args.parentId,
    });
    await ctx.runMutation(internal.messages.updateLastInternal, {
      parentId: args.parentId,
      messageId: args.messageId,
      imageStorageId: args.imageStorageId,
      videoStorageId: args.videoStorageId,
      mediaStorageIds: args.mediaStorageIds,
    });
    return null;
  },
});
