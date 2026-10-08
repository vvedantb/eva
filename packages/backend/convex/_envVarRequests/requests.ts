import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  assertMessageParentAccess,
  authMutation,
  authQuery,
} from "../functions";
import { envVarRequestFields, messageFields } from "../validators";
import {
  chatEntityKindValidator,
  latestChatMessageId,
  resolveChatParent,
} from "../_chat/chatParent";
import { declinedReply } from "./replies";

const requestValidator = v.object({
  _id: v.id("envVarRequests"),
  _creationTime: v.number(),
  ...envVarRequestFields,
});

/**
 * Stores a pending request. Called by the `request_env_var` MCP tool, which
 * has already resolved and access-checked the chat, so this stays internal.
 */
export const create = internalMutation({
  args: {
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
    key: envVarRequestFields.key,
    reason: envVarRequestFields.reason,
    scope: envVarRequestFields.scope,
    repoId: envVarRequestFields.repoId,
    teamId: envVarRequestFields.teamId,
    sandboxId: envVarRequestFields.sandboxId,
  },
  returns: v.union(v.id("envVarRequests"), v.null()),
  handler: async (ctx, { entityKind, entityId, ...fields }) => {
    const parentId = await resolveChatParent(ctx.db, entityKind, entityId);
    if (!parentId) return null;
    const messageId = await latestChatMessageId(ctx.db, parentId);
    return await ctx.db.insert("envVarRequests", {
      ...fields,
      parentId,
      ...(messageId ? { messageId } : {}),
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/** Every request in one chat, for the transcript to place under its turn. */
export const listByParent = authQuery({
  args: { parentId: messageFields.parentId },
  returns: v.array(requestValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    return await ctx.db
      .query("envVarRequests")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();
  },
});

/** One request the caller may answer, or null when it is gone. */
export const getForAnswer = authQuery({
  args: { requestId: v.id("envVarRequests") },
  returns: v.union(requestValidator, v.null()),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    await assertMessageParentAccess(ctx.db, request.parentId, ctx.userId);
    return request;
  },
});

/** Moves a pending request to its answer. False when it was already answered. */
async function answer(
  ctx: MutationCtx,
  request: Doc<"envVarRequests">,
  status: "saved" | "declined",
): Promise<boolean> {
  if (request.status !== "pending") return false;
  await ctx.db.patch(request._id, { status, answeredAt: Date.now() });
  return true;
}

/** Marks a request saved once the save action has stored the value. */
export const markSaved = internalMutation({
  args: { requestId: v.id("envVarRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (request) await answer(ctx, request, "saved");
    return null;
  },
});

/** The user turns the request down. Returns the message to post to the agent. */
export const decline = authMutation({
  args: { requestId: v.id("envVarRequests") },
  returns: v.object({ reply: v.string() }),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("This request no longer exists.");
    await assertMessageParentAccess(ctx.db, request.parentId, ctx.userId);
    if (!(await answer(ctx, request, "declined"))) {
      throw new Error("This request was already answered.");
    }
    return { reply: declinedReply(request.key) };
  },
});
