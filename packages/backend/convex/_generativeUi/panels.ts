import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertMessageParentAccess, authQuery } from "../functions";
import { chatUiPanelFields, messageFields } from "../validators";
import {
  chatEntityKindValidator,
  latestChatMessageId,
  resolveChatParent,
} from "../_chat/chatParent";

const parentIdValidator = messageFields.parentId;

const panelValidator = v.object({
  _id: v.id("chatUiPanels"),
  _creationTime: v.number(),
  ...chatUiPanelFields,
});

/**
 * Stores a composed panel. Called by the `render_ui` MCP tool after
 * composition; the sandbox token has already been checked by the MCP layer, so
 * this stays internal.
 *
 * The panel is anchored to the newest message in the chat (see
 * `latestChatMessageId`).
 */
export const create = internalMutation({
  args: {
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
    prompt: v.string(),
    title: v.optional(v.string()),
    spec: v.string(),
    elementCount: v.number(),
  },
  returns: v.union(v.id("chatUiPanels"), v.null()),
  handler: async (ctx, args): Promise<Id<"chatUiPanels"> | null> => {
    const parentId = await resolveChatParent(
      ctx.db,
      args.entityKind,
      args.entityId,
    );
    if (!parentId) return null;
    const messageId = await latestChatMessageId(ctx.db, parentId);
    return await ctx.db.insert("chatUiPanels", {
      parentId,
      ...(messageId ? { messageId } : {}),
      ...(args.title !== undefined ? { title: args.title } : {}),
      prompt: args.prompt,
      spec: args.spec,
      elementCount: args.elementCount,
      createdAt: Date.now(),
    });
  },
});

/** Every panel in one chat, for the transcript to place under its turn. */
export const listByParent = authQuery({
  args: { parentId: parentIdValidator },
  returns: v.array(panelValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    return await ctx.db
      .query("chatUiPanels")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();
  },
});
