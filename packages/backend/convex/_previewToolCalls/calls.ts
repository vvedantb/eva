import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type DatabaseWriter,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  assertMessageParentAccess,
  authMutation,
  authQuery,
} from "../functions";
import { previewToolCallFields } from "../validators";
import {
  chatEntityKindValidator,
  resolveChatParent,
} from "../_chat/chatParent";

/**
 * Relay for agent → live-preview WebMCP tool calls. The sandbox cannot reach
 * the user's browser, so the MCP tool `create`s a row and polls `get`; every
 * open Eva tab on the chat watches `listPending`, races to `claim` a row, and
 * the winner runs it inside the preview iframe and `complete`s it.
 */

/** Result text is page-controlled and lands in the agent's context verbatim. */
export const RESULT_JSON_MAX_CHARS = 32_000;
export const ERROR_MAX_CHARS = 2_000;
const PENDING_PAGE_SIZE = 10;

/**
 * Cuts `text` to at most `max` characters, ending in a marker so the agent
 * knows the payload was cut rather than reading it as the page's full answer.
 */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const marker = `…[truncated by Eva: ${text.length} characters, kept the first ${max}]`;
  return text.slice(0, Math.max(0, max - marker.length)) + marker;
}

const pendingCallValidator = v.object({
  _id: v.id("previewToolCalls"),
  kind: previewToolCallFields.kind,
  name: previewToolCallFields.name,
  argumentsJson: previewToolCallFields.argumentsJson,
  createdAt: previewToolCallFields.createdAt,
});

const callValidator = v.object({
  _id: v.id("previewToolCalls"),
  _creationTime: v.number(),
  ...previewToolCallFields,
});

/** Unclaimed requests for one chat, oldest first, for the open tab to run. */
export const listPending = authQuery({
  args: { parentId: previewToolCallFields.parentId },
  returns: v.array(pendingCallValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const rows = await ctx.db
      .query("previewToolCalls")
      .withIndex("by_parent_status", (q) =>
        q.eq("parentId", args.parentId).eq("status", "pending"),
      )
      .order("asc")
      .take(PENDING_PAGE_SIZE);
    return rows.map((row) => ({
      _id: row._id,
      kind: row.kind,
      ...(row.name !== undefined ? { name: row.name } : {}),
      ...(row.argumentsJson !== undefined
        ? { argumentsJson: row.argumentsJson }
        : {}),
      createdAt: row.createdAt,
    }));
  },
});

/**
 * Elects the one tab that runs a request. Several tabs can have the same chat
 * open; the mutation is serialisable, so exactly one sees "pending" and wins.
 */
export const claim = authMutation({
  args: { id: v.id("previewToolCalls"), clientId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return false;
    await assertMessageParentAccess(ctx.db, row.parentId, ctx.userId);
    if (row.status !== "pending") return false;
    await ctx.db.patch(row._id, {
      status: "claimed",
      claimedBy: args.clientId,
    });
    return true;
  },
});

/**
 * Records the page's answer. Only the claiming tab may write it, so a slow tab
 * that lost the race — or a row the MCP side already expired — is a no-op.
 */
export const complete = authMutation({
  args: {
    id: v.id("previewToolCalls"),
    clientId: v.string(),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    await assertMessageParentAccess(ctx.db, row.parentId, ctx.userId);
    if (row.status !== "claimed" || row.claimedBy !== args.clientId) {
      return null;
    }
    if (args.error !== undefined) {
      await ctx.db.patch(row._id, {
        status: "error",
        error: capText(args.error, ERROR_MAX_CHARS),
      });
      return null;
    }
    await ctx.db.patch(row._id, {
      status: "done",
      ...(args.resultJson !== undefined
        ? { resultJson: capText(args.resultJson, RESULT_JSON_MAX_CHARS) }
        : {}),
    });
    return null;
  },
});

/**
 * Queues a request from the MCP tool. The sandbox token was checked by the MCP
 * layer, so this stays internal. Returns null when the token's chat is gone.
 */
export const create = internalMutation({
  args: {
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
    kind: previewToolCallFields.kind,
    name: v.optional(v.string()),
    argumentsJson: v.optional(v.string()),
  },
  returns: v.union(v.id("previewToolCalls"), v.null()),
  handler: async (ctx, args): Promise<Id<"previewToolCalls"> | null> => {
    const parentId = await resolveChatParent(
      ctx.db,
      args.entityKind,
      args.entityId,
    );
    if (!parentId || !(await ctx.db.get(parentId))) return null;
    return await ctx.db.insert("previewToolCalls", {
      parentId,
      kind: args.kind,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.argumentsJson !== undefined
        ? { argumentsJson: args.argumentsJson }
        : {}),
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/** One request, for the MCP tool's poll. Null once cleanup removed it. */
export const get = internalQuery({
  args: { id: v.id("previewToolCalls") },
  returns: v.union(callValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<"previewToolCalls"> | null> =>
    await ctx.db.get(args.id),
});

/**
 * Gives up on a request the MCP tool stopped waiting for, so a tab that picks
 * it up late cannot run a side effect nobody will read. Returns the status it
 * gave up from, or null when the row had already finished (or is gone) — the
 * caller then re-reads it rather than discarding a result that just landed.
 */
export const expire = internalMutation({
  args: { id: v.id("previewToolCalls"), error: v.string() },
  returns: v.union(v.literal("pending"), v.literal("claimed"), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || (row.status !== "pending" && row.status !== "claimed")) {
      return null;
    }
    await ctx.db.patch(row._id, {
      status: "error",
      error: capText(args.error, ERROR_MAX_CHARS),
    });
    return row.status;
  },
});

/**
 * Deletes every request for a chat. Called when the entity's sandbox stops:
 * the agent that was waiting is dead, so no row can be read any more, and
 * finished rows are only ever read by that agent's poll.
 */
export async function clearPreviewToolCallsForParent(
  db: DatabaseWriter,
  parentId: Doc<"previewToolCalls">["parentId"],
): Promise<void> {
  const rows = await db
    .query("previewToolCalls")
    .withIndex("by_parent_status", (q) => q.eq("parentId", parentId))
    .collect();
  for (const row of rows) {
    await db.delete(row._id);
  }
}
