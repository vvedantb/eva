import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { createNotification, truncateNotificationText } from "./notifications";
import { ensureDocSubscribed, notifyDocSubscribers } from "./docSubscribers";
import { authQuery, authMutation } from "./functions";
import { internalMutation } from "./_generated/server";
import {
  authorDisplayName,
  teamMentionRecipients,
} from "./_mentions/mentionRecipients";
import { docCommentFields } from "./validators";
import { findDocWithAccess } from "./_docs/access";

const docCommentValidator = v.object({
  _id: v.id("docComments"),
  _creationTime: v.number(),
  ...docCommentFields,
});

function buildDocCommentNotificationMessage(content: string): string {
  const summary = truncateNotificationText(content);
  return summary
    ? `New comment on this document: "${summary}"`
    : "New comment added on this document.";
}

/** Lists all comments for a doc, sorted oldest first. */
export const listByDoc = authQuery({
  args: { docId: v.id("docs") },
  returns: v.array(docCommentValidator),
  handler: async (ctx, args) => {
    const doc = await findDocWithAccess(ctx.db, args.docId, ctx.userId);
    if (!doc) return [];
    const comments = await ctx.db
      .query("docComments")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .collect();
    return comments.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/** Creates a comment on a doc and notifies subscribers + mentioned users. */
export const create = authMutation({
  args: {
    docId: v.id("docs"),
    content: v.string(),
    parentId: v.optional(v.id("docComments")),
    anchorId: v.optional(v.string()),
    anchorText: v.optional(v.string()),
    resolutionTarget: v.optional(
      v.union(v.literal("agent"), v.literal("human")),
    ),
  },
  returns: v.id("docComments"),
  handler: async (ctx, args) => {
    const doc = await findDocWithAccess(ctx.db, args.docId, ctx.userId);
    if (!doc) {
      throw new Error("Document not found");
    }

    const isAgentTarget =
      args.resolutionTarget === "agent" && doc.kind === "pr-recap";

    if (isAgentTarget && args.parentId) {
      throw new Error("Agent-targeted comments must be root threads");
    }

    let parent: Doc<"docComments"> | null = null;
    if (args.parentId) {
      parent = await ctx.db.get(args.parentId);
      if (!parent || parent.docId !== args.docId) {
        throw new Error("Parent comment not found");
      }
    }

    const commentId = await ctx.db.insert("docComments", {
      docId: args.docId,
      content: args.content,
      authorId: ctx.userId,
      parentId: args.parentId,
      anchorId: args.anchorId,
      anchorText: args.anchorText,
      resolutionTarget: args.resolutionTarget,
      createdAt: Date.now(),
    });

    if (isAgentTarget) {
      const pending = doc.pendingAgentCommentIds ?? [];
      await ctx.db.patch(args.docId, {
        pendingAgentCommentIds: [...pending, commentId],
        updatedAt: Date.now(),
      });
      await ensureDocSubscribed(ctx, args.docId, ctx.userId);
      return commentId;
    }

    const notifiedUserIds = new Set<string>([ctx.userId]);
    const authorName = await authorDisplayName(ctx, ctx.userId);
    const commentMessage = buildDocCommentNotificationMessage(args.content);

    await ensureDocSubscribed(ctx, args.docId, ctx.userId);

    if (parent) {
      if (
        parent.authorId &&
        parent.authorId !== ctx.userId &&
        !notifiedUserIds.has(parent.authorId)
      ) {
        await createNotification(ctx, {
          userId: parent.authorId,
          type: "comment_reply",
          title: `${authorName} replied to your comment`,
          repoId: doc.repoId,
          docId: args.docId,
          commentId,
          message: commentMessage,
        });
        notifiedUserIds.add(parent.authorId);
        await ensureDocSubscribed(ctx, args.docId, parent.authorId);
      }
    }

    for (const mentionedUserId of await teamMentionRecipients(
      ctx,
      args.content,
      doc.repoId,
      notifiedUserIds,
    )) {
      await createNotification(ctx, {
        userId: mentionedUserId,
        type: "mention",
        title: `${authorName} mentioned you in a comment`,
        repoId: doc.repoId,
        docId: args.docId,
        commentId,
        message: commentMessage,
      });
      notifiedUserIds.add(mentionedUserId);
      await ensureDocSubscribed(ctx, args.docId, mentionedUserId);
    }

    await notifyDocSubscribers(ctx, {
      docId: args.docId,
      type: "comment_added",
      title: `New comment on "${doc.title}"`,
      message: commentMessage,
      repoId: doc.repoId,
      commentId,
      actorId: ctx.userId,
      alreadyNotified: notifiedUserIds,
    });

    return commentId;
  },
});

/** Resolves or reopens a root comment thread. Any repo member can resolve. */
export const setResolved = authMutation({
  args: {
    id: v.id("docComments"),
    resolved: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comment not found");
    if (comment.parentId) throw new Error("Only root comments can be resolved");
    const doc = await findDocWithAccess(ctx.db, comment.docId, ctx.userId);
    if (!doc) throw new Error("Comment not found");

    if (args.resolved) {
      await ctx.db.patch(args.id, {
        resolvedAt: Date.now(),
        resolvedBy: ctx.userId,
      });
    } else {
      await ctx.db.patch(args.id, {
        resolvedAt: undefined,
        resolvedBy: undefined,
      });
    }
    return null;
  },
});

/** Auto-resolves agent feedback comments after a successful recap revision. */
export const resolveRecapAgentComments = internalMutation({
  args: {
    docId: v.id("docs"),
    commentIds: v.array(v.id("docComments")),
    resolvedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const commentId of args.commentIds) {
      const comment = await ctx.db.get(commentId);
      if (!comment || comment.docId !== args.docId) continue;
      if (comment.resolvedAt !== undefined) continue;
      await ctx.db.patch(commentId, {
        resolvedAt: now,
        resolvedBy: args.resolvedBy,
      });
    }
    await ctx.db.patch(args.docId, {
      pendingAgentCommentIds: [],
      updatedAt: now,
    });
    return null;
  },
});
