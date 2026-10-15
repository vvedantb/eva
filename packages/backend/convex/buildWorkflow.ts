import { v } from "convex/values";
import { startTaskRun } from "./_taskWorkflow/startRun";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { workflow, cancelTrackedWorkflow } from "./workflowManager";
import {
  cancelScheduledFunction,
  scheduleProjectBuildAt,
} from "./_scheduling/helpers";
import {
  authMutation,
  getActiveTaskRun,
  getProjectWithAccess,
  hasActiveRun,
  recomputeProjectPhase,
} from "./functions";
import { buildTaskDoneEvent } from "./taskWorkflow";
import { trackProjectBuildWorkflow } from "./workflowWatchdog";
import { resolveProjectBranchName } from "./_git/branchNames";
import { resolveProjectBaseBranch } from "./_taskWorkflow/resolveBaseBranch";

// --- Workflow ---

/** Orchestrates sequential execution of all todo tasks in a project build. */
export const buildProjectWorkflow = workflow.define({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    // Step 1: Fetch all "todo" tasks for the project, sorted by taskNumber
    const tasks = await step.runQuery(internal.buildWorkflow.getProjectTasks, {
      projectId: args.projectId,
    });

    if (tasks.length === 0) {
      await step.runMutation(internal.buildWorkflow.completeBuild, {
        projectId: args.projectId,
      });
      return;
    }

    // Step 2: Execute tasks sequentially
    let failedTaskId: string | undefined;
    for (const task of tasks) {
      await step.runMutation(internal.buildWorkflow.startTaskForBuild, {
        taskId: task._id,
        projectId: args.projectId,
        userId: args.userId,
        installationId: args.installationId,
      });

      let result = await step.awaitEvent(buildTaskDoneEvent);
      while (result.taskId !== task._id) {
        result = await step.awaitEvent(buildTaskDoneEvent);
      }

      if (!result.success) {
        failedTaskId = task._id;
        break;
      }
    }

    // Step 3: Finalize the build
    await step.runMutation(internal.buildWorkflow.completeBuild, {
      projectId: args.projectId,
      failedTaskId,
    });
  },
});

// --- Internal functions ---

/** Returns all todo tasks for a project, sorted by task number ascending. */
export const getProjectTasks = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("agentTasks"),
      taskNumber: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return tasks
      .filter((t) => t.status === "todo")
      .sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0))
      .map((t) => ({ _id: t._id, taskNumber: t.taskNumber }));
  },
});

/**
 * Starts a single task execution within a project build.
 * Mirrors agentTasks.startExecution without auth checks (called internally
 * from the build workflow); the run itself starts through `startTaskRun`.
 */
export const startTaskForBuild = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    projectId: v.id("projects"),
    userId: v.id("users"),
    installationId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!task.repoId) throw new Error("Task has no associated repository");

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    // Check for active runs on this task
    if (await hasActiveRun(ctx.db, args.taskId)) {
      throw new Error("Task already has an active execution");
    }

    // Compute isFirstTaskOnBranch — check if any task in the project had a successful run
    const projectTasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    let hasSuccessfulRun = false;
    for (const pt of projectTasks) {
      const runs = await ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", pt._id))
        .collect();
      if (runs.some((r) => r.status === "success")) {
        hasSuccessfulRun = true;
        break;
      }
    }
    const isFirstTaskOnBranch = !hasSuccessfulRun;

    // When this build picks up a task a reviewer sent back via "Make
    // changes", link the parked change-request comment so the timeline labels
    // this run "made changes" rather than a bare "success".
    await startTaskRun(ctx, {
      task,
      repo,
      userId: args.userId,
      baseBranch: resolveProjectBaseBranch(project, repo),
      isFirstTaskOnBranch,
      branchName: resolveProjectBranchName(args.projectId, project),
      projectId: args.projectId,
      triggeringCommentId: task.pendingChangeRequestCommentId,
      clearPendingChangeRequest: true,
      rollbackStatus: "todo",
    });

    return null;
  },
});

/** Marks a project build as complete, optionally recording which task failed. */
export const completeBuild = internalMutation({
  args: {
    projectId: v.id("projects"),
    failedTaskId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      activeBuildWorkflowId: undefined,
      lastBuildError: args.failedTaskId
        ? `Build stopped: task ${args.failedTaskId} failed`
        : undefined,
    });
    await recomputeProjectPhase(ctx, args.projectId);
    return null;
  },
});

// --- Public mutations ---

/**
 * Frontend trigger — starts the project build workflow.
 * Called from the "Start cooking" button in ProjectDetailClient.
 */
export const startBuild = authMutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (project.activeBuildWorkflowId) {
      throw new Error("Project already has an active build");
    }

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const workflowId = await workflow.start(
      ctx,
      internal.buildWorkflow.buildProjectWorkflow,
      {
        projectId: args.projectId,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackProjectBuildWorkflow(ctx, args.projectId, workflowId, {
      clearLastBuildError: true,
    });

    return null;
  },
});

// --- Scheduled Build ---

/**
 * Called by the Convex scheduler at the scheduled time.
 * Kicks off the build workflow if the project is still eligible.
 */
export const executeScheduledBuild = internalMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const now = Date.now();

    if (project.scheduledBuildAt === undefined) return null;
    if (project.scheduledBuildAt > now) return null;
    if (
      args.scheduledAt !== undefined &&
      project.scheduledBuildAt !== args.scheduledAt
    ) {
      return null;
    }

    // Clear the due schedule before eligibility checks
    await ctx.db.patch(args.projectId, {
      scheduledBuildAt: undefined,
      scheduledBuildFunctionId: undefined,
    });

    // Don't start if already building
    if (project.activeBuildWorkflowId) return null;

    const repo = await ctx.db.get(project.repoId);
    if (!repo) return null;

    const workflowId = await workflow.start(
      ctx,
      internal.buildWorkflow.buildProjectWorkflow,
      {
        projectId: args.projectId,
        userId: project.userId,
        installationId: repo.installationId,
      },
    );

    await trackProjectBuildWorkflow(ctx, args.projectId, workflowId);

    return null;
  },
});

/** Schedules a project build to run at a future timestamp. */
export const scheduleBuild = authMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    if (project.activeBuildWorkflowId)
      throw new Error("Project already has an active build");
    if (project.scheduledBuildFunctionId)
      throw new Error("Project already has a scheduled build");
    if (args.scheduledAt <= Date.now())
      throw new Error("Scheduled time must be in the future");

    await scheduleProjectBuildAt(ctx, args.projectId, args.scheduledAt);
    return null;
  },
});

/** Cancels a previously scheduled build for a project. */
export const cancelScheduledBuild = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    if (!project.scheduledBuildFunctionId)
      throw new Error("Project has no scheduled build");

    await cancelScheduledFunction(ctx, project.scheduledBuildFunctionId);
    await ctx.db.patch(args.projectId, {
      scheduledBuildAt: undefined,
      scheduledBuildFunctionId: undefined,
    });
    return null;
  },
});

/** Cancels an active build, stopping all in-progress tasks and their workflows. */
export const cancelBuild = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    if (!project.activeBuildWorkflowId) {
      throw new Error("No active build to cancel");
    }

    await cancelTrackedWorkflow(ctx, project.activeBuildWorkflowId);

    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const task of tasks) {
      if (task.status !== "in_progress") continue;

      await cancelTrackedWorkflow(ctx, task.activeWorkflowId);

      const run = await getActiveTaskRun(ctx.db, task._id);

      if (run) {
        await ctx.db.patch(run._id, {
          status: "error",
          error: "Cancelled by user",
          finishedAt: Date.now(),
        });
      }

      await ctx.db.patch(task._id, {
        status: "todo",
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.patch(args.projectId, {
      activeBuildWorkflowId: undefined,
      lastBuildError: "Build cancelled by user",
    });
    await recomputeProjectPhase(ctx, args.projectId);

    return null;
  },
});

/** Reschedules a project build by cancelling the existing schedule and creating a new one. */
export const updateScheduledBuild = authMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    if (args.scheduledAt <= Date.now())
      throw new Error("Scheduled time must be in the future");

    await cancelScheduledFunction(ctx, project.scheduledBuildFunctionId);

    await scheduleProjectBuildAt(ctx, args.projectId, args.scheduledAt);
    return null;
  },
});
