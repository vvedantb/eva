import type { Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { notifyUsers } from "./notifications";
import type { notificationTypeValidator } from "./validators";

/**
 * Auto-subscribes a user to a doc. No-op if a row already exists —
 * `subscribed: false` (explicit opt-out) is left untouched.
 */
export async function ensureDocSubscribed(
  ctx: MutationCtx,
  docId: Id<"docs">,
  userId: Id<"users">,
): Promise<void> {
  const existing = await ctx.db
    .query("docSubscribers")
    .withIndex("by_doc_and_user", (q) =>
      q.eq("docId", docId).eq("userId", userId),
    )
    .first();
  if (existing) return;
  const now = Date.now();
  await ctx.db.insert("docSubscribers", {
    docId,
    userId,
    subscribed: true,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Fans a notification out to every active subscriber of a doc, skipping
 * the actor and anyone already notified via a higher-signal path.
 */
export async function notifyDocSubscribers(
  ctx: MutationCtx,
  params: {
    docId: Id<"docs">;
    type: Infer<typeof notificationTypeValidator>;
    title: string;
    message?: string;
    repoId?: Id<"githubRepos">;
    // Set when the event is a new comment, so each subscriber's click-through
    // lands on that comment rather than the top of the document.
    commentId?: Id<"docComments">;
    actorId?: Id<"users">;
    alreadyNotified?: Set<string>;
  },
): Promise<Set<string>> {
  const subscribers = await ctx.db
    .query("docSubscribers")
    .withIndex("by_doc", (q) => q.eq("docId", params.docId))
    .collect();
  return notifyUsers(
    ctx,
    subscribers.filter((sub) => sub.subscribed).map((sub) => sub.userId),
    {
      type: params.type,
      title: params.title,
      message: params.message,
      repoId: params.repoId,
      docId: params.docId,
      commentId: params.commentId,
    },
    { actorId: params.actorId, alreadyNotified: params.alreadyNotified },
  );
}
