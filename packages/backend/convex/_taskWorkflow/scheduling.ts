import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { startTaskRunTurn } from "../_agentTasks/taskRunTurn";
import { hasActiveTaskRun } from "../_agentTasks/taskRunStatus";
import { fireTaskRunSchedule } from "../_agentTasks/runState";

/** Runs a task whose schedule came: a task-mode turn in its chat. */
export const executeScheduledTask = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    scheduledAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    // Consumes the schedule. A stale job (replaced, cancelled, not due) stops here.
    const fired = await fireTaskRunSchedule(ctx, args.taskId, args.scheduledAt);
    if (!fired.ok) return null;

    if (task.status !== "todo" || !task.repoId || !task.createdBy) return null;
    // The run queues in the task's chat; a busy chat just runs it next.
    if (await hasActiveTaskRun(ctx.db, task)) return null;
    await startTaskRunTurn(ctx, task, { userId: task.createdBy });
    return null;
  },
});
