import { v, type Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { createNotification } from "./notifications";
import { authQuery, authMutation, hasRepoAccess } from "./functions";
import {
  docSubscriberFields,
  type notificationTypeValidator,
} from "./validators";

const docSubscriberDocValidator = v.object({
  _id: v.id("docSubscribers"),
  _creationTime: v.number(),
  ...docSubscriberFields,
});

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
  const notified = params.alreadyNotified ?? new Set<string>();
  const subscribers = await ctx.db
    .query("docSubscribers")
    .withIndex("by_doc", (q) => q.eq("docId", params.docId))
    .collect();
  for (const sub of subscribers) {
    if (!sub.subscribed) continue;
    if (params.actorId && sub.userId === params.actorId) continue;
    if (notified.has(sub.userId)) continue;
    await createNotification(ctx, {
      userId: sub.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      repoId: params.repoId,
      docId: params.docId,
      commentId: params.commentId,
    });
    notified.add(sub.userId);
  }
  return notified;
}

/** Lists the active subscribers of a doc for the UI. */
export const listByDoc = authQuery({
  args: { docId: v.id("docs") },
  returns: v.array(docSubscriberDocValidator),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      return [];
    const subscribers = await ctx.db
      .query("docSubscribers")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .collect();
    return subscribers.filter((sub) => sub.subscribed);
  },
});

/** Subscribes or unsubscribes a user from a doc. */
export const setSubscription = authMutation({
  args: {
    docId: v.id("docs"),
    userId: v.optional(v.id("users")),
    subscribed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      throw new Error("Document not found");
    const targetUserId = args.userId ?? ctx.userId;
    const existing = await ctx.db
      .query("docSubscribers")
      .withIndex("by_doc_and_user", (q) =>
        q.eq("docId", args.docId).eq("userId", targetUserId),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        subscribed: args.subscribed,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("docSubscribers", {
        docId: args.docId,
        userId: targetUserId,
        subscribed: args.subscribed,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});
