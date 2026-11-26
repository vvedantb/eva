import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { startTaskRun } from "../_taskWorkflow/startRun";
import { startQuickTaskRun } from "./taskRunTurn";
import { hasActiveQuickTaskRun } from "./taskRunStatus";
import { runModeValidator } from "../validators";
import {
  assertTaskNotArchived,
  authMutation,
  hasTaskAccess,
  hasActiveRun,
  isFirstTaskOnBranch,
} from "../functions";
import { resolveTaskWorkflowBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { cancelTaskRunSchedule, scheduleTaskRun } from "./runState";

/**
 * Starts a task now. The one start for `startExecution` and "Save and Run" on
 * a new task (`createQuickTask`, `activateDraft`). A quick task runs as a
 * task-mode turn in its chat (`taskRunTurn.ts`); a project task as a run.
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
  if (task.projectId === undefined) {
    // A pending schedule is replaced by this run.
    await cancelTaskRunSchedule(ctx, taskId);
    await startQuickTaskRun(ctx, task, {
      mode: options.mode,
      userId: ctx.userId,
      commentId: options.triggeringCommentId,
    });
    return;
  }
  // A pending schedule is cancelled when the run starts (`markTaskRunStarted`).
  if (await hasActiveRun(ctx.db, taskId)) {
    throw new Error("Task already has an active execution");
  }

  const firstOnBranch = await isFirstTaskOnBranch(ctx.db, taskId);
  const baseBranch = resolveTaskWorkflowBaseBranch(task, repo);

  await startTaskRun(ctx, {
    task,
    repo,
    userId: ctx.userId,
    baseBranch,
    isFirstTaskOnBranch: firstOnBranch,
    mode: options.mode,
    triggeredBy: ctx.userId,
    // Explicit comment (quick-task "Make changes") wins; otherwise consume any
    // comment parked on the task by an earlier change request.
    triggeringCommentId:
      options.triggeringCommentId ?? task.pendingChangeRequestCommentId,
    clearPendingChangeRequest: true,
    rollbackStatus: "todo",
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
    const running =
      task.projectId === undefined
        ? await hasActiveQuickTaskRun(ctx.db, task)
        : await hasActiveRun(ctx.db, args.id);
    if (running) {
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
