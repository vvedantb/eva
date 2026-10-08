import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createNotification } from "./notifications";
import { ensureSubscribed, notifySubscribers } from "./taskSubscribers";
import { authQuery, authMutation, hasTaskAccess } from "./functions";
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

/** Trims and truncates comment content for a notification, or null if empty. */
function summariseCommentContent(content: string): string | null {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return null;
  }
  return trimmedContent.length > 180
    ? `${trimmedContent.slice(0, 177)}...`
    : trimmedContent;
}

/** Builds a truncated notification message for a new task comment. */
function buildCommentNotificationMessage(
  content: string,
  projectId: Id<"projects"> | undefined,
): string {
  const scopeLabel = projectId ? "project task" : "quick task";
  const summary = summariseCommentContent(content);
  return summary
    ? `New comment on this ${scopeLabel}: "${summary}"`
    : `New comment added on this ${scopeLabel}.`;
}

/** Builds the subscriber notification message for a "Make changes" request. */
function buildChangeRequestNotificationMessage(
  content: string,
  projectId: Id<"projects"> | undefined,
): string {
  const scopeLabel = projectId ? "project task" : "quick task";
  const summary = summariseCommentContent(content);
  return summary
    ? `Changes requested on this ${scopeLabel}: "${summary}"`
    : `Changes requested on this ${scopeLabel}.`;
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
    // Set when the comment is submitted via "Make changes" (re-runs Eva). The
    // subscriber broadcast then reads as a change request, not a plain comment.
    requestsChanges: v.optional(v.boolean()),
  },
  returns: v.id("taskComments"),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Task not found");
    }

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

    // A "Make changes" submission parks itself on the task as the pending
    // change-request comment. The next run created for this task (Build Project
    // for project tasks, immediate startExecution for quick tasks) copies it
    // onto the run's `triggeringCommentId`, so the timeline labels that run
    // "made changes" rather than a bare "success".
    if (args.requestsChanges) {
      await ctx.db.patch(args.taskId, {
        pendingChangeRequestCommentId: commentId,
      });
    }

    // Clear the stored draft for this comment surface now that it has been submitted.
    await deleteDraftForTarget(ctx.db, ctx.userId, args.taskId, args.parentId);

    const notifiedUserIds = new Set<string>([ctx.userId]);
    const author = await ctx.db.get(ctx.userId);
    const authorName = author?.fullName?.trim() || "Someone";

    // Commenting subscribes you to the task (sticky opt-out respected).
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
        message: buildCommentNotificationMessage(args.content, task.projectId),
      });
      notifiedUserIds.add(parent.authorId);
      await ensureSubscribed(ctx, args.taskId, parent.authorId);
    }

    const mentionedUserIds = extractMentionedUserIds(ctx, args.content);
    if (mentionedUserIds.length > 0) {
      const repo = task.repoId ? await ctx.db.get(task.repoId) : null;
      const teamId = repo?.teamId;
      const mentionTitle = `${authorName} mentioned you in a comment`;
      const mentionMessage = buildCommentNotificationMessage(
        args.content,
        task.projectId,
      );
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
          repoId: task.repoId,
          projectId: task.projectId,
          taskId: args.taskId,
          commentId,
          message: mentionMessage,
        });
        notifiedUserIds.add(mentionedUserId);
        await ensureSubscribed(ctx, args.taskId, mentionedUserId);
      }
    }

    // Broadcast to the rest of the subscriber set (creator, assignee, followers).
    // Mention/reply recipients are already in notifiedUserIds, so they keep their
    // higher-signal notification instead of a duplicate broadcast. A "Make
    // changes" submission reads as a change request rather than a new comment.
    await notifySubscribers(ctx, {
      taskId: args.taskId,
      type: args.requestsChanges ? "changes_requested" : "comment_added",
      title: args.requestsChanges
        ? `${authorName} requested changes on "${task.title}"`
        : `New comment on "${task.title}"`,
      message: args.requestsChanges
        ? buildChangeRequestNotificationMessage(args.content, task.projectId)
        : buildCommentNotificationMessage(args.content, task.projectId),
      repoId: task.repoId,
      projectId: task.projectId,
      commentId,
      actorId: ctx.userId,
      alreadyNotified: notifiedUserIds,
    });

    return commentId;
  },
});

/** Updates a task comment. Only the original author may edit. */
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
    await ctx.db.patch(args.id, { content: args.content });
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
    await ctx.db.patch(args.id, {
      deletedAt: Date.now(),
      content: DELETED_COMMENT_PLACEHOLDER,
    });
    return null;
  },
});
