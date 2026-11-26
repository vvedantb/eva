import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizeIdOrThrow } from "./functions";
import {
  mergeHandedTask,
  retryFailedTask,
  scheduleReadyProjectTasks,
  startHandedTask,
} from "./_projects/scheduler";

// A project's child tasks run in parallel, each like a quick task, started by
// the scheduler (`_projects/scheduler.ts`) once approved: the coordinator's
// at creation; a person's asks go to the coordinator, which starts each or
// adds it to an open task. There is no project build to start, schedule or
// cancel.

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

/** The coordinator's `start_task`: starts a handed task (`startHandedTask`). */
export const startTaskAsCoordinator = internalMutation({
  args: { projectId: v.string(), taskId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await startHandedTask(
      ctx,
      normalizeIdOrThrow(ctx.db, "projects", args.projectId, "Project"),
      normalizeIdOrThrow(ctx.db, "agentTasks", args.taskId, "Task"),
    );
    return null;
  },
});

/**
 * The coordinator's `merge_task_into`: closes a handed task as added
 * to an open task (`mergeHandedTask`). Returns the target's task number.
 */
export const mergeTaskIntoAsCoordinator = internalMutation({
  args: { projectId: v.string(), taskId: v.string(), intoTaskId: v.string() },
  returns: v.object({ intoTaskNumber: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const into = await mergeHandedTask(
      ctx,
      normalizeIdOrThrow(ctx.db, "projects", args.projectId, "Project"),
      normalizeIdOrThrow(ctx.db, "agentTasks", args.taskId, "Task"),
      normalizeIdOrThrow(ctx.db, "agentTasks", args.intoTaskId, "Task"),
    );
    return { intoTaskNumber: into.taskNumber };
  },
});
