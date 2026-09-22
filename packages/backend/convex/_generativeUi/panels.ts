import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertMessageParentAccess, authQuery } from "../functions";
import { chatUiPanelFields, messageFields } from "../validators";

const parentIdValidator = messageFields.parentId;

const entityKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

const panelValidator = v.object({
  _id: v.id("chatUiPanels"),
  _creationTime: v.number(),
  ...chatUiPanelFields,
});

type ChatParentId = typeof parentIdValidator.type;

/** The chat a sandbox token names, resolved to the id its messages hang off. */
function resolveChatParent(
  ctx: MutationCtx,
  entityKind: "session" | "task" | "project",
  entityId: string,
): ChatParentId | null {
  if (entityKind === "session") return ctx.db.normalizeId("sessions", entityId);
  if (entityKind === "task") return ctx.db.normalizeId("agentTasks", entityId);
  return ctx.db.normalizeId("projects", entityId);
}

/**
 * Stores a composed panel. Called by the `render_ui` MCP tool after
 * composition; the sandbox token has already been checked by the MCP layer, so
 * this stays internal.
 *
 * The panel is anchored to the newest message in the chat, which during a turn
 * is the assistant placeholder the agent is filling in. That is what makes it
 * appear under the reply that created it rather than at the end of history.
 */
export const create = internalMutation({
  args: {
    entityKind: entityKindValidator,
    entityId: v.string(),
    prompt: v.string(),
    title: v.optional(v.string()),
    spec: v.string(),
    elementCount: v.number(),
  },
  returns: v.union(v.id("chatUiPanels"), v.null()),
  handler: async (ctx, args): Promise<Id<"chatUiPanels"> | null> => {
    const parentId = resolveChatParent(ctx, args.entityKind, args.entityId);
    if (!parentId) return null;
    const latestMessage = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .order("desc")
      .first();
    return await ctx.db.insert("chatUiPanels", {
      parentId,
      ...(latestMessage ? { messageId: latestMessage._id } : {}),
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
