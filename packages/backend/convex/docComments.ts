import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { createNotification } from "./notifications";
import { ensureDocSubscribed, notifyDocSubscribers } from "./docSubscribers";
import { authQuery, authMutation, hasRepoAccess } from "./functions";
import { internalMutation } from "./_generated/server";
import { extractMentionedUserIds } from "./_mentions/extractMentionedUserIds";
import { docCommentFields } from "./validators";
import { hasCodebaseRepoAccess } from "./_githubRepos/helpers";

export const DELETED_DOC_COMMENT_PLACEHOLDER =
  "This comment has been deleted by the author";

const docCommentValidator = v.object({
  _id: v.id("docComments"),
  _creationTime: v.number(),
  ...docCommentFields,
});

function buildDocCommentNotificationMessage(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "New comment added on this document.";
  const summary =
    trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
  return `New comment on this document: "${summary}"`;
}

async function canAccessDoc(
  db: DatabaseReader,
  userId: Id<"users">,
  doc: { repoId: Id<"githubRepos">; kind?: "document" | "pr-recap" },
): Promise<boolean> {
  if (doc.kind === "pr-recap") {
    return hasCodebaseRepoAccess(db, doc.repoId, userId);
  }
  return hasRepoAccess(db, doc.repoId, userId);
}

/** Lists all comments for a doc, sorted oldest first. */
export const listByDoc = authQuery({
  args: { docId: v.id("docs") },
  returns: v.array(docCommentValidator),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await canAccessDoc(ctx.db, ctx.userId, doc))) return [];
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
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await canAccessDoc(ctx.db, ctx.userId, doc))) {
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
    const author = await ctx.db.get(ctx.userId);
    const authorName = author?.fullName?.trim() || "Someone";

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
          message: buildDocCommentNotificationMessage(args.content),
        });
        notifiedUserIds.add(parent.authorId);
        await ensureDocSubscribed(ctx, args.docId, parent.authorId);
      }
    }

    const mentionedUserIds = extractMentionedUserIds(ctx, args.content);
    if (mentionedUserIds.length > 0) {
      const repo = await ctx.db.get(doc.repoId);
      const teamId = repo?.teamId;
      const mentionTitle = `${authorName} mentioned you in a comment`;
      const mentionMessage = buildDocCommentNotificationMessage(args.content);
      for (const mentionedUserId of mentionedUserIds) {
        if (notifiedUserIds.has(mentionedUserId)) continue;
        if (teamId) {
          const membership = await ctx.db
            .query("teamMembers")
            .withIndex("by_team_and_user", (q) =>
              q.eq("teamId", teamId).eq("userId", mentionedUserId),
            )
            .first();
          if (!membership) continue;
        }
        await createNotification(ctx, {
          userId: mentionedUserId,
          type: "mention",
          title: mentionTitle,
          repoId: doc.repoId,
          docId: args.docId,
          commentId,
          message: mentionMessage,
        });
        notifiedUserIds.add(mentionedUserId);
        await ensureDocSubscribed(ctx, args.docId, mentionedUserId);
      }
    }

    await notifyDocSubscribers(ctx, {
      docId: args.docId,
      type: "comment_added",
      title: `New comment on "${doc.title}"`,
      message: buildDocCommentNotificationMessage(args.content),
      repoId: doc.repoId,
      commentId,
      actorId: ctx.userId,
      alreadyNotified: notifiedUserIds,
    });

    return commentId;
  },
});

/** Updates a doc comment. Only the original author may edit. */
export const update = authMutation({
  args: {
    id: v.id("docComments"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comment not found");
    if (comment.deletedAt !== undefined)
      throw new Error("Cannot edit a deleted comment");
    if (comment.authorId !== ctx.userId)
      throw new Error("Only the comment author can edit");
    const doc = await ctx.db.get(comment.docId);
    if (!doc || !(await canAccessDoc(ctx.db, ctx.userId, doc)))
      throw new Error("Comment not found");
    await ctx.db.patch(args.id, { content: args.content });
    return null;
  },
});

/** Soft-deletes a doc comment; replies are kept. */
export const remove = authMutation({
  args: { id: v.id("docComments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comment not found");
    if (comment.authorId !== ctx.userId)
      throw new Error("Only the comment author can delete");
    const doc = await ctx.db.get(comment.docId);
    if (!doc || !(await canAccessDoc(ctx.db, ctx.userId, doc)))
      throw new Error("Comment not found");
    if (comment.deletedAt !== undefined)
      throw new Error("Comment already deleted");
    await ctx.db.patch(args.id, {
      deletedAt: Date.now(),
      content: DELETED_DOC_COMMENT_PLACEHOLDER,
    });
    return null;
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
    const doc = await ctx.db.get(comment.docId);
    if (!doc || !(await canAccessDoc(ctx.db, ctx.userId, doc)))
      throw new Error("Comment not found");

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
