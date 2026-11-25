import type { WithoutSystemFields } from "convex/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { findLatestTurn } from "../_chat/turnStore";

/** Avatars under a thread root: its most recent distinct repliers. */
export const MAX_THREAD_REPLIERS = 3;

/** Replies a thread panel loads at once; older ones past this are not shown. */
export const MAX_THREAD_REPLIES = 500;

/**
 * The mention id the coordinator chat's picker gives Eva (`@[Eva](id)`).
 * TODO(v2 PR A): import `EVA_MENTION_ID` / `mentionsEva` from `@eva/shared`
 * once that lands, and delete these two.
 */
const EVA_MENTION_ID = "eva_coordinator_mention";

/**
 * A reply wakes Eva only when it @mentions her: replies are between people by
 * default (projects v2, decision 2).
 */
export function replyMentionsEva(content: string): boolean {
  return content.includes(`](${EVA_MENTION_ID})`);
}

/**
 * The prompt Eva gets for a reply: the thread's root message and the reply,
 * so she answers in that context. Her answer row lands in the same thread.
 */
export function threadReplyPrompt(
  root: Pick<Doc<"messages">, "role" | "content">,
  reply: string,
): string {
  const who = root.role === "assistant" ? "your message" : "a message";
  return [
    `This is a reply in a thread on ${who}:`,
    "",
    root.content
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"),
    "",
    reply,
    "",
    "Answer in this thread, in a few short lines.",
  ].join("\n");
}

/**
 * Counts a new row into its thread root: the reply count, when the last one
 * landed and, for a person's reply, the avatars shown under the root.
 */
export async function bumpThreadRoot(
  ctx: MutationCtx,
  rootId: Id<"messages">,
  replierId: Id<"users"> | undefined,
): Promise<void> {
  const root = await ctx.db.get(rootId);
  if (!root) return;
  const repliers = replierId
    ? [
        replierId,
        ...(root.replierIds ?? []).filter((id) => id !== replierId),
      ].slice(0, MAX_THREAD_REPLIERS)
    : root.replierIds;
  await ctx.db.patch(rootId, {
    replyCount: (root.replyCount ?? 0) + 1,
    lastReplyAt: Date.now(),
    ...(repliers ? { replierIds: repliers } : {}),
  });
}

/**
 * Inserts an Eva row that follows the chat's latest turn: an alert, a retry
 * placeholder or a continuation. When that turn answered in a thread, the row
 * joins the thread too, so it does not land in the main chat.
 */
export async function insertTurnFollowUp(
  ctx: MutationCtx,
  row: Omit<WithoutSystemFields<Doc<"messages">>, "replyTo">,
): Promise<{ messageId: Id<"messages">; replyTo?: Id<"messages"> }> {
  const replyTo = (await findLatestTurn(ctx, row.parentId))?.replyTo;
  const messageId = await ctx.db.insert("messages", { ...row, replyTo });
  if (replyTo !== undefined) await bumpThreadRoot(ctx, replyTo, undefined);
  return { messageId, replyTo };
}
