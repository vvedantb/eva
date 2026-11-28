import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createNotification, truncateNotificationText } from "./notifications";
import { ensureSubscribed, notifySubscribers } from "./taskSubscribers";
import {
  assertTaskNotArchived,
  authQuery,
  authMutation,
  hasTaskAccess,
} from "./functions";
import {
  authorDisplayName,
  teamMentionRecipients,
} from "./_mentions/mentionRecipients";
import { extractMentionedUserIds } from "./_mentions/extractMentionedUserIds";
import { taskCommentFields } from "./validators";
import { deleteDraftForTarget } from "./_drafts/helpers";

export const DELETED_COMMENT_PLACEHOLDER =
  "This comment has been deleted by the author";

const taskCommentValidator = v.object({
  _id: v.id("taskComments"),
  _creationTime: v.number(),
  ...taskCommentFields,
});

function commentNotificationMessage(
  requestsChanges: boolean | undefined,
  projectId: Id<"projects"> | undefined,
  content: string,
): string {
  const scopeLabel = projectId ? "project task" : "quick task";
  const summary = truncateNotificationText(content);
  if (requestsChanges) {
    return summary
      ? `Changes requested on this ${scopeLabel}: "${summary}"`
      : `Changes requested on this ${scopeLabel}.`;
  }
  return summary
    ? `New comment on this ${scopeLabel}: "${summary}"`
    : `New comment added on this ${scopeLabel}.`;
}

async function notifyCommentMentions(
  ctx: MutationCtx,
  args: {
    task: Doc<"agentTasks">;
    commentId: Id<"taskComments">;
    content: string;
    authorName: string;
    skip: Set<string>;
  },
): Promise<void> {
  const { task } = args;
  for (const mentionedUserId of await teamMentionRecipients(
    ctx,
    args.content,
    task.repoId,
    args.skip,
  )) {
    await createNotification(ctx, {
      userId: mentionedUserId,
      type: "mention",
      title: `${args.authorName} mentioned you in a comment`,
      repoId: task.repoId,
      projectId: task.projectId,
      taskId: task._id,
      commentId: args.commentId,
      message: commentNotificationMessage(false, task.projectId, args.content),
      urgency: "normal",
    });
    args.skip.add(mentionedUserId);
    await ensureSubscribed(ctx, task._id, mentionedUserId);
  }
}

/** Lists all comments for a task, sorted oldest first. */
export const listByTask = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(taskCommentValidator),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const comments = await ctx.db
      .query("taskComments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return comments.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/** Creates a comment on a task and notifies the creator, assignee + mentioned users. */
export const create = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    content: v.string(),
    parentId: v.optional(v.id("taskComments")),
    requestsChanges: v.optional(v.boolean()),
  },
  returns: v.id("taskComments"),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Task not found");
    }
    await assertTaskNotArchived(ctx.db, task);

    const parent = args.parentId ? await ctx.db.get(args.parentId) : null;
    if (args.parentId && (!parent || parent.taskId !== args.taskId)) {
      throw new Error("Parent comment not found");
    }

    const commentId = await ctx.db.insert("taskComments", {
      taskId: args.taskId,
      content: args.content,
      authorId: ctx.userId,
      parentId: args.parentId,
      createdAt: Date.now(),
    });

    if (args.requestsChanges) {
      await ctx.db.patch(args.taskId, {
        pendingChangeRequestCommentId: commentId,
      });
    }

    await deleteDraftForTarget(ctx.db, ctx.userId, args.taskId, args.parentId);

    const notifiedUserIds = new Set<string>([ctx.userId]);
    const authorName = await authorDisplayName(ctx, ctx.userId);
    const commentMessage = commentNotificationMessage(
      false,
      task.projectId,
      args.content,
    );

    await ensureSubscribed(ctx, args.taskId, ctx.userId);

    if (
      parent?.authorId &&
      parent.authorId !== ctx.userId &&
      !notifiedUserIds.has(parent.authorId)
    ) {
      await createNotification(ctx, {
        userId: parent.authorId,
        type: "comment_reply",
        title: `${authorName} replied to your comment`,
        repoId: task.repoId,
        projectId: task.projectId,
        taskId: args.taskId,
        commentId,
        message: commentMessage,
      });
      notifiedUserIds.add(parent.authorId);
      await ensureSubscribed(ctx, args.taskId, parent.authorId);
    }

    await notifyCommentMentions(ctx, {
      task,
      commentId,
      content: args.content,
      authorName,
      skip: notifiedUserIds,
    });

    await notifySubscribers(ctx, {
      taskId: args.taskId,
      type: args.requestsChanges ? "changes_requested" : "comment_added",
      title: args.requestsChanges
        ? `${authorName} requested changes on "${task.title}"`
        : `New comment on "${task.title}"`,
      message: commentNotificationMessage(
        args.requestsChanges,
        task.projectId,
        args.content,
      ),
      repoId: task.repoId,
      projectId: task.projectId,
      commentId,
      actorId: ctx.userId,
      alreadyNotified: notifiedUserIds,
    });

    return commentId;
  },
});

/**
 * Updates a task comment. Only the original author may edit. People the edit
 * newly `@`-mentions are notified; those the comment already named are not.
 */
export const update = authMutation({
  args: {
    id: v.id("taskComments"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.id);
    if (!comment) {
      throw new Error("Comment not found");
    }
    if (comment.deletedAt !== undefined) {
      throw new Error("Cannot edit a deleted comment");
    }
    if (comment.authorId !== ctx.userId) {
      throw new Error("Only the comment author can edit");
    }
    const task = await ctx.db.get(comment.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Comment not found");
    }
    await assertTaskNotArchived(ctx.db, task);
    await ctx.db.patch(args.id, { content: args.content });
    await notifyCommentMentions(ctx, {
      task,
      commentId: args.id,
      content: args.content,
      authorName: await authorDisplayName(ctx, ctx.userId),
      skip: new Set([
        ctx.userId,
        ...extractMentionedUserIds(ctx, comment.content),
      ]),
    });
    return null;
  },
});

/** Soft-deletes a task comment; replies are kept. */
export const remove = authMutation({
  args: { id: v.id("taskComments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.id);
    if (!comment) {
      throw new Error("Comment not found");
    }
    if (comment.authorId !== ctx.userId) {
      throw new Error("Only the comment author can delete");
    }
    const task = await ctx.db.get(comment.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Comment not found");
    }
    if (comment.deletedAt !== undefined) {
      throw new Error("Comment already deleted");
    }
    await assertTaskNotArchived(ctx.db, task);
    await ctx.db.patch(args.id, {
      deletedAt: Date.now(),
      content: DELETED_COMMENT_PLACEHOLDER,
    });
    return null;
  },
});
