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
  finishProjectBuild,
  fireProjectBuildSchedule,
  projectBuildWorkflowId,
} from "./_projects/buildState";
import { syncProjectSession } from "./_sessions/ownedSession";
import {
  approveTasks,
  projectTodoTaskIds,
  retryFailedTask,
  scheduleReadyProjectTasks,
} from "./_projects/scheduler";

// A project's child tasks run in parallel, each like a quick task, started by
// the scheduler (`_projects/scheduler.ts`) once approved: the coordinator's
// at creation, a person's once approved (at creation or from Triage). There
// is no project build to start, schedule or cancel any more; what is left of
// it below only winds down builds stored before the scheduler.

// --- Scheduler ---

/**
 * Starts the project's ready child tasks: approved `todo` tasks, not halted
 * and with no run pending, up to `MAX_PARALLEL_PROJECT_TASKS` in progress.
 * Idempotent.
 */
export const scheduleReadyTasks = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await scheduleReadyProjectTasks(ctx, args.projectId);
    return null;
  },
});

/** A person approves tasks waiting in Triage; the scheduler then starts what is ready. */
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

// --- Builds stored before the scheduler ---

/**
 * A build scheduled before the scheduler, firing at its time: approves every
 * todo task of the project and starts what is ready. Nothing schedules a new
 * one; this drains the jobs already pending.
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
    await approveTasks(
      ctx,
      args.projectId,
      await projectTodoTaskIds(ctx.db, args.projectId),
    );
    await scheduleReadyProjectTasks(ctx, args.projectId);
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
