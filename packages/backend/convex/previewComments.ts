import { v } from "convex/values";
import {
  buildAnnotationDisplay,
  parseAnnotationDisplay,
} from "@eva/shared/previewAnnotationDisplay";
import { getUserDisplayName } from "@eva/shared/taskDetail";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  authMutation,
  authQuery,
  hasRepoAccess,
  normalizeIdOrThrow,
} from "./functions";
import { sendChatMessage } from "./chats";
import { resolveMobileChat } from "./_mobile/chatTarget";
import { findMainChat, getSessionChatWithAccess } from "./_sessionChats/helpers";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * The preview comments drawer: every "Select element" annotation of one chat,
 * newest first, with the agent's reply to each. Not the Chrome extension's
 * `annotations` table (that holds the extension's page pins).
 */

/** Newest comments only: the drawer is a review list, not an archive. */
const MAX_COMMENTS = 200;
/** Transcript rows read after a comment to find its reply. */
const REPLY_SCAN_LIMIT = 6;
const EXCERPT_LENGTH = 280;

const replyValidator = v.union(
  v.object({ status: v.literal("working") }),
  v.object({ status: v.literal("done"), excerpt: v.string() }),
  v.object({ status: v.literal("stopped") }),
  v.object({ status: v.literal("failed") }),
);

const commentFields = {
  feedback: v.string(),
  element: v.string(),
  pagePath: v.string(),
  timestamp: v.number(),
};

const previewCommentValidator = v.union(
  v.object({
    kind: v.literal("message"),
    id: v.id("messages"),
    ...commentFields,
    /** Unset until a reply row exists (the turn has not started yet). */
    reply: v.optional(replyValidator),
    /** Set once someone marks the comment done; unset while it is open. */
    resolved: v.optional(v.object({ at: v.number(), byName: v.string() })),
  }),
  v.object({
    kind: v.literal("queued"),
    id: v.id("queuedMessages"),
    ...commentFields,
  }),
);

/** Markdown → one plain line, for a three-line clamp in the card. */
function plainExcerpt(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > EXCERPT_LENGTH
    ? `${text.slice(0, EXCERPT_LENGTH - 1)}…`
    : text;
}

function replyOf(row: Doc<"messages">) {
  if (row.finishedAt === undefined) return { status: "working" as const };
  if (row.stopped === true) return { status: "stopped" as const };
  if (row.errorDetail !== undefined || row.errorType !== undefined) {
    return { status: "failed" as const };
  }
  return { status: "done" as const, excerpt: plainExcerpt(row.content) };
}

/**
 * The first assistant row after a comment in the transcript, before the next
 * user row. Thread replies (`replyTo` set) and system alerts are skipped.
 */
async function findReply(ctx: QueryCtx, comment: Doc<"messages">) {
  const after = await ctx.db
    .query("messages")
    .withIndex("by_parent_and_reply_to", (q) =>
      q
        .eq("parentId", comment.parentId)
        .eq("replyTo", undefined)
        .gt("_creationTime", comment._creationTime),
    )
    .take(REPLY_SCAN_LIMIT);
  for (const row of after) {
    if (row.isSystemAlert === true) continue;
    if (row.role === "user") return undefined;
    if (row.role === "assistant") return replyOf(row);
  }
  return undefined;
}

/** Display names for the people who resolved comments, one read each. */
async function namesOf(
  ctx: QueryCtx,
  userIds: readonly Id<"users">[],
): Promise<Map<Id<"users">, string>> {
  const unique = [...new Set(userIds)];
  const users = await Promise.all(unique.map((id) => ctx.db.get(id)));
  const names = new Map<Id<"users">, string>();
  unique.forEach((id, index) => {
    const user = users[index];
    if (user) names.set(id, getUserDisplayName(user));
  });
  return names;
}

/** The feedback without the `[Annotated …]` suffix the chat shows. */
function feedbackOf(content: string): string {
  return parseAnnotationDisplay(content)?.feedback ?? content;
}

/** The drawer's list for one chat, for a caller who may open it. */
async function listComments(
  ctx: QueryCtx,
  chatId: Id<"sessionChats">,
  userId: Id<"users">,
) {
  {
    const { chat } = await getSessionChatWithAccess(ctx.db, chatId, userId);
    const parentId = chat._id;
    const [rows, queued] = await Promise.all([
      ctx.db
        .query("messages")
        .withIndex("by_parent_and_annotation_page", (q) =>
          q.eq("parentId", parentId).gte("annotation.pagePath", ""),
        )
        .collect(),
      ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_created", (q) => q.eq("parentId", parentId))
        .collect(),
    ]);
    const newest = rows
      .filter((row) => row.role === "user" && row.annotation !== undefined)
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, MAX_COMMENTS);
    const resolverNames = await namesOf(
      ctx,
      newest.flatMap((row) =>
        row.annotation?.resolvedBy ? [row.annotation.resolvedBy] : [],
      ),
    );
    const messages = await Promise.all(
      newest.map(async (row) => {
        const annotation = row.annotation;
        if (!annotation) return null;
        const reply = await findReply(ctx, row);
        const { resolvedAt, resolvedBy } = annotation;
        return {
          kind: "message" as const,
          id: row._id,
          feedback: feedbackOf(row.content),
          element: annotation.element,
          pagePath: annotation.pagePath,
          timestamp: row.timestamp,
          ...(reply ? { reply } : {}),
          ...(resolvedAt !== undefined
            ? {
                resolved: {
                  at: resolvedAt,
                  byName:
                    (resolvedBy && resolverNames.get(resolvedBy)) ?? "Someone",
                },
              }
            : {}),
        };
      }),
    );
    const waiting = queued.flatMap((row) =>
      row.annotation && row.replyTo === undefined
        ? [
            {
              kind: "queued" as const,
              id: row._id,
              feedback: feedbackOf(row.displayContent ?? row.content),
              element: row.annotation.element,
              pagePath: row.annotation.pagePath,
              timestamp: row.createdAt,
            },
          ]
        : [],
    );
    return [
      ...waiting.sort((a, b) => b.timestamp - a.timestamp),
      ...messages.flatMap((comment) => (comment ? [comment] : [])),
    ];
  }
}

export const list = authQuery({
  args: { chatId: v.id("sessionChats") },
  returns: v.array(previewCommentValidator),
  handler: (ctx, args) => listComments(ctx, args.chatId, ctx.userId),
});

/**
 * Marks a preview comment done, or opens it again. Anyone who can open the
 * chat may do either, as with doc comments. Queued comments have no row yet,
 * so they cannot be resolved.
 */
async function setCommentResolved(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"messages">,
  resolved: boolean,
): Promise<null> {
  const row = await ctx.db.get(id);
  const chatId = row ? ctx.db.normalizeId("sessionChats", row.parentId) : null;
  if (!row || !row.annotation || !chatId) {
    throw new Error("Comment not found");
  }
  await getSessionChatWithAccess(ctx.db, chatId, userId);
  const { resolvedAt, resolvedBy, ...open } = row.annotation;
  void resolvedAt;
  void resolvedBy;
  await ctx.db.patch(row._id, {
    annotation: resolved
      ? { ...open, resolvedAt: Date.now(), resolvedBy: userId }
      : open,
  });
  return null;
}

export const setResolved = authMutation({
  args: { id: v.id("messages"), resolved: v.boolean() },
  returns: v.null(),
  handler: (ctx, args) =>
    setCommentResolved(ctx, ctx.userId, args.id, args.resolved),
});

/**
 * Direct sandbox links. The preview-link HTTP routes (`previewCommentsHttp.ts`)
 * act for the user a signed link token names, so these take the user id as an
 * argument and are internal: only the token check reaches them.
 */

/**
 * The user and chat a link token is minted for: the signed-in caller and the
 * main chat of the session that owns `sandboxId`. Null when the sandbox has
 * no session or the caller may not open it.
 */
export const linkTarget = authQuery({
  args: { repoId: v.id("githubRepos"), sandboxId: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      chatId: v.id("sessionChats"),
      /** The chat's path in the Eva web app, for "View in chat". */
      webPath: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
    if (!session || session.repoId !== args.repoId) return null;
    const chat = await findMainChat(ctx.db, session._id);
    if (!chat) return null;
    const resolved = await resolveMobileChat(ctx.db, String(chat._id));
    return {
      userId: ctx.userId,
      chatId: chat._id,
      webPath: resolved?.chat.webPath ?? "",
    };
  },
});

// The direct-link action passes the ids from its signed token as strings.
export const listForUser = internalQuery({
  args: { userId: v.string(), chatId: v.string() },
  returns: v.array(previewCommentValidator),
  handler: (ctx, args) =>
    listComments(
      ctx,
      normalizeIdOrThrow(ctx.db, "sessionChats", args.chatId, "Chat"),
      normalizeIdOrThrow(ctx.db, "users", args.userId, "User"),
    ),
});

export const setResolvedForUser = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
    resolved: v.boolean(),
  },
  returns: v.null(),
  handler: (ctx, args) =>
    setCommentResolved(
      ctx,
      normalizeIdOrThrow(ctx.db, "users", args.userId, "User"),
      normalizeIdOrThrow(ctx.db, "messages", args.id, "Comment"),
      args.resolved,
    ),
});

/** Sends a comment from a direct link: the same path as the Eva page's card. */
export const sendForUser = internalMutation({
  args: {
    userId: v.string(),
    chatId: v.string(),
    feedback: v.string(),
    /** The agent prompt, built from the element context. */
    prompt: v.string(),
    ref: v.object({
      element: v.string(),
      pagePath: v.string(),
      selector: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const feedback = args.feedback.trim();
    if (!feedback) throw new Error("Write a note first");
    const userId = normalizeIdOrThrow(ctx.db, "users", args.userId, "User");
    return sendChatMessage(
      { ...ctx, userId },
      {
        target: args.chatId,
        message: args.prompt,
        displayContent: buildAnnotationDisplay(feedback, args.ref),
        annotation: args.ref,
      },
    );
  },
});
