import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { assertMessageParentAccess, authMutation, authQuery } from "./functions";
import {
  feedbackFields,
  feedbackSentimentValidator,
  messageFields,
} from "./validators";
import { latestChatMessageId, resolveChatParent } from "./_chat/chatParent";
import { chatEntityKindValidator } from "./_validators/enums";
import {
  callerCanSeeChatSource,
  chatSourceArgFromFields,
  chatSourceFieldsForEntityId,
  chatSourceSummaryValidator,
  repoIdForSource,
  resolveChatSource,
  type RepoCache,
} from "./_chatSource/helpers";

/**
 * Feedback on Eva turns. Two writers share one table:
 * - the user, through thumbs up / down on a finished turn (`rateTurn`);
 * - the agent, through the `submit_feedback` MCP tool (`createFromAgent`)
 *   when the user shows clear frustration or praise.
 * The transcript reads one chat's rows (`listForChat`); the global Feedback
 * page reads the newest rows across every chat the caller can open (`list`).
 */

/** Longest comment kept; feedback is a short note, not a report. */
export const FEEDBACK_COMMENT_MAX = 2_000;
/** Newest rows the Feedback page scans before access checks. */
const FEEDBACK_SCAN_LIMIT = 500;

const feedbackRowValidator = v.object({
  _id: v.id("feedback"),
  _creationTime: v.number(),
  ...feedbackFields,
});

function cleanComment(comment: string | undefined): string | undefined {
  const trimmed = comment?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, FEEDBACK_COMMENT_MAX);
}

/** Every feedback row in one chat, for the transcript to place under its turn. */
export const listForChat = authQuery({
  args: { parentId: messageFields.parentId },
  returns: v.array(feedbackRowValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    return await ctx.db
      .query("feedback")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();
  },
});

/**
 * Sets, changes or clears the caller's thumbs on one assistant turn. One row
 * per user per turn: a second click updates it, `sentiment: null` deletes it.
 * `comment` is left as it is when omitted; an empty string clears it.
 */
export const rateTurn = authMutation({
  args: {
    // A plain string: the transcript keys rows by string ids (optimistic
    // turns have no real id yet), so the id is checked here.
    messageId: v.string(),
    sentiment: v.union(feedbackSentimentValidator, v.null()),
    comment: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const messageId = ctx.db.normalizeId("messages", args.messageId);
    const message = messageId ? await ctx.db.get(messageId) : null;
    if (!messageId || !message || message.role !== "assistant") {
      throw new Error("Only an Eva reply can take feedback.");
    }
    await assertMessageParentAccess(ctx.db, message.parentId, ctx.userId);
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", messageId).eq("userId", ctx.userId),
      )
      .collect();
    const existing = rows.find((row) => row.author === "user");

    if (args.sentiment === null) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    const comment =
      args.comment === undefined ? existing?.comment : cleanComment(args.comment);
    if (existing) {
      // `comment: undefined` unsets the field (an emptied comment box).
      await ctx.db.patch(existing._id, { sentiment: args.sentiment, comment });
      return null;
    }
    const source = await chatSourceFieldsForEntityId(
      ctx.db,
      String(message.parentId),
    );
    const repoId = source ? await repoIdForSource(ctx.db, source) : undefined;
    await ctx.db.insert("feedback", {
      ...source,
      parentId: message.parentId,
      ...(repoId ? { repoId } : {}),
      messageId,
      userId: ctx.userId,
      author: "user",
      sentiment: args.sentiment,
      ...(comment ? { comment } : {}),
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Deletes one row. A user's thumbs can only be removed by that user; an
 * agent's report by anyone who can open the chat, since it is about them.
 */
export const remove = authMutation({
  args: { feedbackId: v.id("feedback") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.feedbackId);
    if (!row) return null;
    await assertMessageParentAccess(ctx.db, row.parentId, ctx.userId);
    if (row.author === "user" && row.userId !== ctx.userId) {
      throw new Error("Only the person who rated a turn can remove it.");
    }
    await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * Stores an agent's report. Called by the `submit_feedback` MCP tool, which
 * has already checked the sandbox token, so this stays internal. Anchored to
 * the newest message in the chat — during a turn, the reply being written.
 */
export const createFromAgent = internalMutation({
  args: {
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
    // The MCP context carries the users id as a plain string.
    userId: v.string(),
    sentiment: feedbackSentimentValidator,
    comment: v.string(),
  },
  returns: v.union(v.id("feedback"), v.null()),
  handler: async (ctx, args): Promise<Id<"feedback"> | null> => {
    const parentId = await resolveChatParent(
      ctx.db,
      args.entityKind,
      args.entityId,
    );
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!parentId || !userId) return null;
    const messageId = await latestChatMessageId(ctx.db, parentId);
    const source = await chatSourceFieldsForEntityId(ctx.db, String(parentId));
    const repoId = source ? await repoIdForSource(ctx.db, source) : undefined;
    const comment = cleanComment(args.comment);
    return await ctx.db.insert("feedback", {
      ...source,
      parentId,
      ...(repoId ? { repoId } : {}),
      ...(messageId ? { messageId } : {}),
      userId,
      author: "agent",
      sentiment: args.sentiment,
      ...(comment ? { comment } : {}),
      createdAt: Date.now(),
    });
  },
});

const feedbackListRowValidator = v.object({
  _id: v.id("feedback"),
  author: feedbackFields.author,
  sentiment: feedbackFields.sentiment,
  comment: v.optional(v.string()),
  createdAt: v.number(),
  messageId: v.optional(v.id("messages")),
  repoId: v.optional(v.id("githubRepos")),
  userName: v.optional(v.string()),
  source: chatSourceSummaryValidator,
});

function userName(user: Doc<"users"> | null): string | undefined {
  if (!user) return undefined;
  const full =
    user.fullName?.trim() ||
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return full || user.email;
}

/**
 * The newest feedback across every chat the caller can open, newest first.
 * Filters (repo, author, sentiment) run on the client over this list.
 */
export const list = authQuery({
  args: {},
  returns: v.array(feedbackListRowValidator),
  handler: async (ctx) => {
    const recent = await ctx.db
      .query("feedback")
      .order("desc")
      .take(FEEDBACK_SCAN_LIMIT);
    const repoCache: RepoCache = new Map();
    const access = new Map<string, boolean>();
    const users = new Map<string, string | undefined>();
    const result = [];
    for (const row of recent) {
      const arg = chatSourceArgFromFields(row);
      if (!arg) continue;
      const key = String(
        row.sourceSessionId ?? row.sourceTaskId ?? row.sourceProjectId,
      );
      let canSee = access.get(key);
      if (canSee === undefined) {
        canSee = await callerCanSeeChatSource(ctx, arg);
        access.set(key, canSee);
      }
      if (!canSee) continue;
      const source = await resolveChatSource(ctx, row, repoCache);
      if (!source) continue;
      const userKey = String(row.userId);
      if (!users.has(userKey)) {
        users.set(userKey, userName(await ctx.db.get(row.userId)));
      }
      const name = users.get(userKey);
      result.push({
        _id: row._id,
        author: row.author,
        sentiment: row.sentiment,
        ...(row.comment ? { comment: row.comment } : {}),
        createdAt: row.createdAt,
        ...(row.messageId ? { messageId: row.messageId } : {}),
        ...(row.repoId ? { repoId: row.repoId } : {}),
        ...(name ? { userName: name } : {}),
        source,
      });
    }
    return result;
  },
});
