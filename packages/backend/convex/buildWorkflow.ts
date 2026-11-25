import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  authMutation,
  getProjectWithAccess,
  normalizeIdOrThrow,
} from "./functions";
import {
  approveTasks,
  retryFailedTask,
  scheduleReadyProjectTasks,
} from "./_projects/scheduler";

// A project's child tasks run in parallel, each like a quick task, started by
// the scheduler (`_projects/scheduler.ts`) once approved: the coordinator's
// at creation, a person's once approved (at creation or from Triage). There
// is no project build to start, schedule or cancel.

// --- Scheduler ---

/**
 * Starts the project's ready child tasks: approved `todo` tasks, not halted
 * and with no run pending, with no cap on how many run.
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
