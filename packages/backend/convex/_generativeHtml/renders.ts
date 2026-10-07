import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertMessageParentAccess, authQuery } from "../functions";
import { chatHtmlRenderFields, messageFields } from "../validators";
import {
  chatEntityKindValidator,
  latestChatMessageId,
  resolveChatParent,
} from "../_chat/chatParent";

const renderValidator = v.object({
  _id: v.id("chatHtmlRenders"),
  _creationTime: v.number(),
  ...chatHtmlRenderFields,
});

/**
 * Stores one page. Called by the `render_html` MCP tool, which has already
 * checked the sandbox token and the page's size, so this stays internal.
 *
 * The page is anchored to the newest message in the chat (see
 * `latestChatMessageId`), the same as a `render_ui` panel.
 */
export const create = internalMutation({
  args: {
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
    title: v.string(),
    height: v.number(),
    html: v.string(),
  },
  returns: v.union(v.id("chatHtmlRenders"), v.null()),
  handler: async (ctx, args): Promise<Id<"chatHtmlRenders"> | null> => {
    const parentId = resolveChatParent(ctx.db, args.entityKind, args.entityId);
    if (!parentId) return null;
    const messageId = await latestChatMessageId(ctx.db, parentId);
    const bodyId = await ctx.db.insert("chatHtmlRenderBodies", {
      html: args.html,
    });
    return await ctx.db.insert("chatHtmlRenders", {
      parentId,
      ...(messageId ? { messageId } : {}),
      title: args.title,
      height: args.height,
      bodyId,
      createdAt: Date.now(),
    });
  },
});

/** Every page in one chat, without the pages, for the transcript to place. */
export const listByParent = authQuery({
  args: { parentId: messageFields.parentId },
  returns: v.array(renderValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    return await ctx.db
      .query("chatHtmlRenders")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();
  },
});

/**
 * One page, for its frame. Read once per mounted frame; a page never changes,
 * so the subscription never re-runs. Access follows the render row, so a
 * forked chat (which shares the body) reads it through its own row.
 */
export const getHtml = authQuery({
  args: { renderId: v.id("chatHtmlRenders") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const render = await ctx.db.get(args.renderId);
    if (!render) return null;
    await assertMessageParentAccess(ctx.db, render.parentId, ctx.userId);
    const body = await ctx.db.get(render.bodyId);
    return body?.html ?? null;
  },
});
