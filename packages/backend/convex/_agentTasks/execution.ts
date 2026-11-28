import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { startTaskRunTurn } from "./taskRunTurn";
import { hasActiveTaskRun } from "./taskRunStatus";
import { runModeValidator } from "../validators";
import {
  assertTaskNotArchived,
  authMutation,
  hasTaskAccess,
} from "../functions";
import { cancelTaskRunSchedule, scheduleTaskRun } from "./runState";

/**
 * Starts a task now. The one start for `startExecution` and "Save and Run" on
 * a new task (`createQuickTask`, `activateDraft`): a task-mode turn in the
 * task's chat (`taskRunTurn.ts`).
 */
export async function startTaskExecution(
  ctx: MutationCtx & { userId: Id<"users"> },
  taskId: Id<"agentTasks">,
  options: {
    mode?: Infer<typeof runModeValidator>;
    triggeringCommentId?: Id<"taskComments">;
  } = {},
) {
  const task = await ctx.db.get(taskId);
  if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
    throw new Error("Task not found");
  await assertTaskNotArchived(ctx.db, task);
  if (task.status === "draft") {
    throw new Error("Cannot execute a draft task");
  }
  if (!task.repoId) {
    throw new Error("Task has no associated repository");
  }
  const repo = await ctx.db.get(task.repoId);
  if (!repo) {
    throw new Error("Repository not found");
  }
  await cancelTaskRunSchedule(ctx, taskId);
  await startTaskRunTurn(ctx, task, {
    mode: options.mode,
    userId: ctx.userId,
    commentId: options.triggeringCommentId,
  });
}

/** Runs a task now (Run, Retry, Resolve Conflicts). */
export const startExecution = authMutation({
  args: {
    id: v.id("agentTasks"),
    mode: v.optional(runModeValidator),
    triggeringCommentId: v.optional(v.id("taskComments")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await startTaskExecution(ctx, args.id, {
      mode: args.mode,
      triggeringCommentId: args.triggeringCommentId,
    });
    return null;
  },
});

/** Schedules a task for future execution at a specified time. */
export const scheduleExecution = authMutation({
  args: {
    id: v.id("agentTasks"),
    scheduledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    await assertTaskNotArchived(ctx.db, task);
    if (task.status !== "todo") {
      throw new Error("Only todo tasks can be scheduled");
    }
    if (await hasActiveTaskRun(ctx.db, task)) {
      throw new Error("Task already has an active execution");
    }
    if (args.scheduledAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    const result = await scheduleTaskRun(
      ctx,
      args.id,
      "schedule",
      args.scheduledAt,
    );
    if (!result.ok) throw new Error(result.reason);
    return null;
  },
});

/** Cancels a previously scheduled task execution. */
export const cancelScheduledExecution = authMutation({
  args: { id: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    const result = await cancelTaskRunSchedule(ctx, args.id);
    if (!result.ok) throw new Error(result.reason);
    await ctx.db.patch(args.id, { updatedAt: Date.now() });
    return null;
  },
});

/** Reschedules a task execution to a new time. */
export const updateScheduledExecution = authMutation({
  args: {
    id: v.id("agentTasks"),
    scheduledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
    await assertTaskNotArchived(ctx.db, task);
    if (args.scheduledAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    const result = await scheduleTaskRun(
      ctx,
      args.id,
      "schedule",
      args.scheduledAt,
    );
    if (!result.ok) throw new Error(result.reason);
    return null;
  },
});
