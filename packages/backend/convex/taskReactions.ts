import { v } from "convex/values";
import { authQuery, authMutation, hasTaskAccess } from "./functions";
import { reactionTargetValidator } from "./validators";

const reactionViewValidator = v.object({
  targetType: reactionTargetValidator,
  targetId: v.string(),
  userId: v.id("users"),
  emoji: v.string(),
});

/** Lists every reaction for a task in one query (grouped client-side). */
export const listByTask = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(reactionViewValidator),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const reactions = await ctx.db
      .query("taskReactions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return reactions.map((reaction) => ({
      targetType: reaction.targetType,
      targetId: reaction.targetId,
      userId: reaction.userId,
      emoji: reaction.emoji,
    }));
  },
});

/**
 * Adds or removes the current user's reaction on a target within a task.
 *
 * Idempotent toggle: reacting again with the same emoji removes it, while a
 * user may hold several different emoji on one target. Access is gated solely
 * by `taskId` (a real id), so `targetId` stays an opaque string and is never
 * resolved with `db.get` — a reaction is just a marker scoped to a task the
 * user can already access.
 */
export const toggle = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    targetType: reactionTargetValidator,
    targetId: v.string(),
    emoji: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Task not found");
    }

    const existing = await ctx.db
      .query("taskReactions")
      .withIndex("by_target_user_emoji", (q) =>
        q
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
          .eq("userId", ctx.userId)
          .eq("emoji", args.emoji),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.insert("taskReactions", {
        taskId: args.taskId,
        targetType: args.targetType,
        targetId: args.targetId,
        emoji: args.emoji,
        userId: ctx.userId,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
