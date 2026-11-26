import { v } from "convex/values";
import { parseAnnotationDisplay } from "@eva/shared/previewAnnotationDisplay";
import { authQuery } from "./functions";
import { getSessionChatWithAccess } from "./_sessionChats/helpers";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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

/** The feedback without the `[Annotated …]` suffix the chat shows. */
function feedbackOf(content: string): string {
  return parseAnnotationDisplay(content)?.feedback ?? content;
}

export const list = authQuery({
  args: { chatId: v.id("sessionChats") },
  returns: v.array(previewCommentValidator),
  handler: async (ctx, args) => {
    const { chat } = await getSessionChatWithAccess(
      ctx.db,
      args.chatId,
      ctx.userId,
    );
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
    const messages = await Promise.all(
      newest.map(async (row) => {
        const annotation = row.annotation;
        if (!annotation) return null;
        const reply = await findReply(ctx, row);
        return {
          kind: "message" as const,
          id: row._id,
          feedback: feedbackOf(row.content),
          element: annotation.element,
          pagePath: annotation.pagePath,
          timestamp: row.timestamp,
          ...(reply ? { reply } : {}),
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
  },
});
