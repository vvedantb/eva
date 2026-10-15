import { v } from "convex/values";
import { startTaskRun } from "../_taskWorkflow/startRun";
import { aiModelValidator, runModeValidator } from "../validators";
import {
  authMutation,
  hasTaskAccess,
  hasActiveRun,
  isFirstTaskOnBranch,
} from "../functions";
import { resolveProjectBranchName } from "../_git/branchNames";
import { resolveTaskWorkflowBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import {
  cancelScheduledFunction,
  scheduleTaskExecutionAt,
} from "../_scheduling/helpers";

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
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId)))
      throw new Error("Task not found");
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
    if (task.scheduledFunctionId) {
      await cancelScheduledFunction(ctx, task.scheduledFunctionId);
      await ctx.db.patch(args.id, {
        scheduledAt: undefined,
        scheduledFunctionId: undefined,
      });
    }

    if (await hasActiveRun(ctx.db, args.id)) {
      throw new Error("Task already has an active execution");
    }

    const project = task.projectId ? await ctx.db.get(task.projectId) : null;

    if (task.projectId) {
      if (!project) {
        throw new Error("Project not found");
      }

      const projectTasks = await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", task.projectId))
        .collect();

      for (const pt of projectTasks) {
        if (pt._id === args.id) continue;
        if (await hasActiveRun(ctx.db, pt._id)) {
          const awaitingReview =
            task.status === "business_review" || task.status === "code_review";
          if (awaitingReview) {
            await ctx.db.patch(args.id, {
              status: "todo",
              updatedAt: Date.now(),
            });
          }
          throw new Error("Another task in this project is already running");
        }
      }
    }

    const firstOnBranch = await isFirstTaskOnBranch(
      ctx.db,
      args.id,
      task.projectId,
    );

    const branchName =
      task.projectId && project
        ? resolveProjectBranchName(task.projectId, project)
        : undefined;
    const baseBranch = resolveTaskWorkflowBaseBranch(
      task,
      repo,
      project ?? undefined,
    );

    const runId = await startTaskRun(ctx, {
      task,
      repo,
      userId: ctx.userId,
      baseBranch,
      isFirstTaskOnBranch: firstOnBranch,
      branchName,
      projectId: task.projectId,
      mode: args.mode,
      triggeredBy: ctx.userId,
      // Explicit comment (quick-task "Make changes") wins; otherwise consume any
      // comment parked on the task by an earlier change request.
      triggeringCommentId:
        args.triggeringCommentId ?? task.pendingChangeRequestCommentId,
      clearPendingChangeRequest: true,
      rollbackStatus: "todo",
    });

    return {
      runId,
      taskId: args.id,
      repoId: task.repoId,
      installationId: repo.installationId,
      projectId: task.projectId,
      branchName,
      baseBranch,
      isFirstTaskOnBranch: firstOnBranch,
      model: task.model ?? repo.defaultModel,
    };
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
    if (task.status !== "todo") {
      throw new Error("Only todo tasks can be scheduled");
    }
    if (await hasActiveRun(ctx.db, args.id)) {
      throw new Error("Task already has an active execution");
    }
    if (args.scheduledAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    await scheduleTaskExecutionAt(ctx, args.id, args.scheduledAt);
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
    if (!task.scheduledFunctionId) {
      throw new Error("Task is not scheduled");
    }

    await cancelScheduledFunction(ctx, task.scheduledFunctionId);
    await ctx.db.patch(args.id, {
      scheduledAt: undefined,
      scheduledFunctionId: undefined,
      updatedAt: Date.now(),
    });
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
    if (args.scheduledAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    await cancelScheduledFunction(ctx, task.scheduledFunctionId);

    await scheduleTaskExecutionAt(ctx, args.id, args.scheduledAt);
    return null;
  },
});
