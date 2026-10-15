import { v, type Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { createNotification } from "./notifications";
import { authQuery, authMutation, hasTaskAccess } from "./functions";
import {
  taskSubscriberFields,
  type notificationTypeValidator,
} from "./validators";

const taskSubscriberDocValidator = v.object({
  _id: v.id("taskSubscribers"),
  _creationTime: v.number(),
  ...taskSubscriberFields,
});

/**
 * Auto-subscribes a user to a task (creating, being assigned, commenting, being
 * mentioned). No-op if a row already exists — crucially, a `subscribed: false`
 * row (explicit opt-out) is left untouched so unsubscribes are sticky. Only the
 * absence of a row results in a new subscription.
 */
export async function ensureSubscribed(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  userId: Id<"users">,
): Promise<void> {
  const existing = await ctx.db
    .query("taskSubscribers")
    .withIndex("by_task_and_user", (q) =>
      q.eq("taskId", taskId).eq("userId", userId),
    )
    .first();
  if (existing) return;
  const now = Date.now();
  await ctx.db.insert("taskSubscribers", {
    taskId,
    userId,
    subscribed: true,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Fans a notification out to every active subscriber of a task, skipping the
 * actor who triggered the event and anyone already notified by a higher-signal
 * path (e.g. a mention). Returns the running set of notified user IDs so callers
 * can chain it with their own dedup set.
 */
export async function notifySubscribers(
  ctx: MutationCtx,
  params: {
    taskId: Id<"agentTasks">;
    type: Infer<typeof notificationTypeValidator>;
    title: string;
    message?: string;
    repoId?: Id<"githubRepos">;
    projectId?: Id<"projects">;
    // Set when the event is a new comment, so each subscriber's click-through
    // lands on that comment rather than the top of the task.
    commentId?: Id<"taskComments">;
    actorId?: Id<"users">;
    alreadyNotified?: Set<string>;
  },
): Promise<Set<string>> {
  const notified = params.alreadyNotified ?? new Set<string>();
  const subscribers = await ctx.db
    .query("taskSubscribers")
    .withIndex("by_task", (q) => q.eq("taskId", params.taskId))
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
      projectId: params.projectId,
      taskId: params.taskId,
      commentId: params.commentId,
    });
    notified.add(sub.userId);
  }
  return notified;
}

/**
 * Fans a single project-level notification out to everyone subscribed to any of
 * the project's tasks. Used for events that belong to the project as a whole (a
 * project PR merging or closing) so subscribers get one notification about the
 * project instead of one per task. No `taskId` is set, so the click-through
 * lands on the project rather than an arbitrary task inside it.
 */
export async function notifyProjectSubscribers(
  ctx: MutationCtx,
  params: {
    projectId: Id<"projects">;
    type: Infer<typeof notificationTypeValidator>;
    title: string;
    message?: string;
    repoId?: Id<"githubRepos">;
  },
): Promise<void> {
  const tasks = await ctx.db
    .query("agentTasks")
    .withIndex("by_project", (q) => q.eq("projectId", params.projectId))
    .collect();

  const notified = new Set<string>();
  for (const task of tasks) {
    const subscribers = await ctx.db
      .query("taskSubscribers")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    for (const sub of subscribers) {
      if (!sub.subscribed) continue;
      if (notified.has(sub.userId)) continue;
      await createNotification(ctx, {
        userId: sub.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        repoId: params.repoId,
        projectId: params.projectId,
      });
      notified.add(sub.userId);
    }
  }
}

/** Lists the active subscribers (subscribed = true) of a task for the UI. */
export const listByTask = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(taskSubscriberDocValidator),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const subscribers = await ctx.db
      .query("taskSubscribers")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return subscribers.filter((sub) => sub.subscribed);
  },
});

/**
 * Subscribes or unsubscribes a user to a task. Omitting `userId` targets the
 * current user (the self toggle); passing one lets a member add or remove a
 * teammate. Setting `subscribed: false` writes a sticky opt-out tombstone.
 */
export const setSubscription = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    userId: v.optional(v.id("users")),
    subscribed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    const targetUserId = args.userId ?? ctx.userId;
    const existing = await ctx.db
      .query("taskSubscribers")
      .withIndex("by_task_and_user", (q) =>
        q.eq("taskId", args.taskId).eq("userId", targetUserId),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        subscribed: args.subscribed,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("taskSubscribers", {
        taskId: args.taskId,
        userId: targetUserId,
        subscribed: args.subscribed,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});
