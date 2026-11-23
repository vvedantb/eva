import { v } from "convex/values";
import { finishTaskRun, taskRunWorkflowId } from "./_agentTasks/runState";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { findOwnedSession } from "./_sessions/owner";
import { abandonTaskRunSandbox } from "./_sessions/sandbox";
import { cancelTrackedWorkflow } from "./workflowManager";
import {
  authMutation,
  getActiveTaskRun,
  getProjectWithAccess,
  normalizeIdOrThrow,
  recomputeProjectPhase,
} from "./functions";
import { stopProjectInterview } from "./workflowWatchdog";
import {
  cancelProjectBuildSchedule,
  finishProjectBuild,
  fireProjectBuildSchedule,
  projectBuildWorkflowId,
  projectScheduledBuildAt,
  scheduleProjectBuild,
} from "./_projects/buildState";
import { syncProjectSession } from "./_sessions/ownedSession";
import {
  approveTasks,
  projectTodoTaskIds,
  retryFailedTask,
  scheduleReadyProjectTasks,
  withdrawUnstartedApprovals,
} from "./_projects/scheduler";

// A project's child tasks run in parallel, each like a quick task, started by
// the scheduler (`_projects/scheduler.ts`) once a person approved them. The
// old build names below stay as thin wrappers for older clients and the MCP
// build tools: "start the build" approves every todo task and schedules;
// "cancel the build" takes back the approval of every task not started.

// --- Scheduler ---

/**
 * Starts the project's ready child tasks: approved `todo` tasks whose
 * dependencies are done and merged, up to `MAX_PARALLEL_PROJECT_TASKS` in
 * progress. Idempotent.
 */
export const scheduleReadyTasks = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await scheduleReadyProjectTasks(ctx, args.projectId);
    return null;
  },
});

/** A person approves a batch of the project's todo tasks; the scheduler then starts what is ready. */
export const approveProjectTasks = authMutation({
  args: {
    projectId: v.id("projects"),
    taskIds: v.array(v.id("agentTasks")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
      "contributor",
    );
    await approveTasks(ctx, args.projectId, args.taskIds);
    await scheduleReadyProjectTasks(ctx, args.projectId);
    return null;
  },
});

/**
 * The coordinator restarts a failed child task, once (`retryFailedTask`),
 * with a note on what went wrong that the retried run's prompt carries.
 * Internal: the coordinator's `retry_task` tool calls it; a person restarts a
 * task with `agentTasks.startExecution`, which does not use the count.
 */
export const retryFailedTaskAsCoordinator = internalMutation({
  args: {
    /** The coordinator's project: the task must belong to it. */
    projectId: v.string(),
    taskId: v.string(),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const taskId = normalizeIdOrThrow(ctx.db, "agentTasks", args.taskId, "Task");
    const task = await ctx.db.get(taskId);
    if (String(task?.projectId) !== args.projectId) {
      throw new Error("That task is not part of this project.");
    }
    await retryFailedTask(ctx, taskId, args.note);
    return null;
  },
});

/** Approves every todo task of the project, then schedules: the old "build". */
async function approveAllAndSchedule(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  await approveTasks(ctx, projectId, await projectTodoTaskIds(ctx.db, projectId));
  await scheduleReadyProjectTasks(ctx, projectId);
}

// --- Old build names (thin wrappers) ---

/**
 * "Start cooking": approves every todo task of the project and starts what
 * is ready. Kept for older clients and `start_project_build`.
 */
export const startBuild = authMutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
      "contributor",
    );
    await approveAllAndSchedule(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { lastBuildError: undefined });
    return null;
  },
});

// --- Scheduled build (old name: approve all and schedule at a time) ---

/**
 * Called by the Convex scheduler at the scheduled time: approves every todo
 * task of the project and starts what is ready.
 */
export const executeScheduledBuild = internalMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.optional(v.number()),
    /** Old busy-session retries carried this; unused now. */
    firstScheduledAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    // Consume the due schedule; a stale or replaced job stops here.
    const fired = await fireProjectBuildSchedule(
      ctx,
      args.projectId,
      args.scheduledAt,
    );
    if (!fired.ok) return null;
    await approveAllAndSchedule(ctx, args.projectId);
    return null;
  },
});

/** Schedules "approve all and start" for a future time (`schedule_project_build`). */
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
      "contributor",
    );
    if (projectScheduledBuildAt(project) !== undefined)
      throw new Error("Project already has a scheduled build");
    if (args.scheduledAt <= Date.now())
      throw new Error("Scheduled time must be in the future");

    await scheduleProjectBuild(
      ctx,
      args.projectId,
      "schedule",
      args.scheduledAt,
    );
    return null;
  },
});

/** Cancels a previously scheduled build for a project. */
export const cancelScheduledBuild = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
      "contributor",
    );
    const cancelled = await cancelProjectBuildSchedule(ctx, args.projectId);
    if (!cancelled.ok) throw new Error(cancelled.reason);
    return null;
  },
});

/** Reschedules a project build; the new schedule replaces (and cancels) the pending one. */
export const updateScheduledBuild = authMutation({
  args: {
    projectId: v.id("projects"),
    scheduledAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
      "contributor",
    );
    if (args.scheduledAt <= Date.now())
      throw new Error("Scheduled time must be in the future");

    await scheduleProjectBuild(
      ctx,
      args.projectId,
      "schedule",
      args.scheduledAt,
    );
    return null;
  },
});

/**
 * Stops a build workflow from before the scheduler (`projects.build` still
 * `running`): its workflow, every in-progress task's run on the project
 * session (back to todo), then the build state, with `reason` as the build
 * error. Nothing starts such a build any more.
 */
async function cancelLegacyBuild(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  buildWorkflowId: string,
  reason: string,
): Promise<void> {
  await cancelTrackedWorkflow(ctx, buildWorkflowId);

  const projectSession = await findOwnedSession(ctx.db, {
    kind: "project",
    projectId,
  });

  const tasks = await ctx.db
    .query("agentTasks")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  for (const task of tasks) {
    if (task.status !== "in_progress") continue;

    await cancelTrackedWorkflow(ctx, taskRunWorkflowId(task));

    const run = await getActiveTaskRun(ctx.db, task._id);

    if (run && projectSession) {
      // The claimed start fails, or the attached VM stays up for the chat.
      await abandonTaskRunSandbox(ctx, projectSession._id, run, {
        keepActive: true,
      });
    }
    if (run) {
      await ctx.db.patch(run._id, {
        status: "error",
        error: reason,
        finishedAt: Date.now(),
      });
    }

    await ctx.db.patch(task._id, {
      status: "todo",
      updatedAt: Date.now(),
    });
    await finishTaskRun(ctx, task._id, undefined);
  }

  await finishProjectBuild(ctx, projectId, buildWorkflowId);
  await ctx.db.patch(projectId, { lastBuildError: reason });
  await recomputeProjectPhase(ctx, projectId);
}

/**
 * "Cancel the build": takes back the approval of every todo task that has
 * not started, so nothing new starts. Running tasks keep going (stop one with
 * `stop_agent`); a build workflow from before the scheduler is stopped. Kept
 * for older clients and `cancel_project_build`.
 */
export const cancelBuild = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
      "contributor",
    );
    await withdrawUnstartedApprovals(ctx, args.projectId);
    const legacyWorkflowId = projectBuildWorkflowId(project);
    if (legacyWorkflowId !== undefined) {
      await cancelLegacyBuild(
        ctx,
        args.projectId,
        legacyWorkflowId,
        "Build cancelled by user",
      );
    }
    return null;
  },
});

/**
 * The project left the board (completed, cancelled, deleted) while its own
 * work still holds the session (`projectHoldsSession`): stop a legacy build
 * and the interview / spec workflow first, then retire the session
 * (`syncProjectSession`), so nothing keeps running on a VM being stopped.
 */
export const releaseProjectSessionForRetire = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const buildWorkflowId = projectBuildWorkflowId(project);
    if (buildWorkflowId !== undefined) {
      await cancelLegacyBuild(
        ctx,
        args.projectId,
        buildWorkflowId,
        "Build stopped: the project was closed",
      );
    }
    await stopProjectInterview(ctx, args.projectId, undefined, {
      state: "cancelled",
      error: "Interview stopped: the project was closed",
    });
    await syncProjectSession(ctx, args.projectId);
    return null;
  },
});
