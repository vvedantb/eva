import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { startTaskRun } from "../_taskWorkflow/startRun";
import { aiModelValidator, runModeValidator } from "../validators";
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
 * Starts a task now: a run and its workflow. The one start for `startExecution`
 * and "Save and Run" on a new task (`createQuickTask`, `activateDraft`).
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
  if (await hasActiveRun(ctx.db, taskId)) {
    throw new Error("Task already has an active execution");
  }

  const firstOnBranch = await isFirstTaskOnBranch(ctx.db, taskId);
  const baseBranch = resolveTaskWorkflowBaseBranch(task, repo);

  const runId = await startTaskRun(ctx, {
    task,
    repo,
    userId: ctx.userId,
    baseBranch,
    isFirstTaskOnBranch: firstOnBranch,
    mode: options.mode,
    triggeredBy: ctx.userId,
    triggeringCommentId:
      options.triggeringCommentId ?? task.pendingChangeRequestCommentId,
    clearPendingChangeRequest: true,
    rollbackStatus: "todo",
  });

  return {
    runId,
    taskId,
    repoId: task.repoId,
    installationId: repo.installationId,
    projectId: task.projectId,
    baseBranch,
    isFirstTaskOnBranch: firstOnBranch,
    model: task.model ?? repo.defaultModel,
  };
}

/** Starts task execution by creating a run and launching the workflow. */
export const startExecution = authMutation({
  args: {
    id: v.id("agentTasks"),
    mode: v.optional(runModeValidator),
    triggeringCommentId: v.optional(v.id("taskComments")),
  },
  returns: v.object({
    runId: v.id("agentRuns"),
    taskId: v.id("agentTasks"),
    repoId: v.id("githubRepos"),
    installationId: v.number(),
    projectId: v.optional(v.id("projects")),
    branchName: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    isFirstTaskOnBranch: v.boolean(),
    model: v.optional(aiModelValidator),
  }),
  handler: async (ctx, args) =>
    await startTaskExecution(ctx, args.id, {
      mode: args.mode,
      triggeringCommentId: args.triggeringCommentId,
    }),
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
    const existingRuns = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    if (
      existingRuns.some((r) => r.status === "queued" || r.status === "running")
    ) {
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
