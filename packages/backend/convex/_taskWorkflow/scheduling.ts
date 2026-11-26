import { startTaskRunTurn } from "../_agentTasks/taskRunTurn";
import { hasActiveTaskRun } from "../_agentTasks/taskRunStatus";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  getActiveTaskRun,
  hasActiveRun,
} from "../functions";
import {
  buildQuickTaskRetryDelayMs,
  isSandboxNetworkIssue,
  isRetryableWatchdogExit,
  TASK_CHAT_BUSY_ERROR,
  TASK_CHAT_BUSY_RETRY_MS,
} from "./recovery";
import {
  finishTaskRun,
  fireTaskRunSchedule,
  scheduleTaskRun,
} from "../_agentTasks/runState";

/** Schedules an automatic retry for a failed task (quick or project) if the failure looks transient. */
export const maybeScheduleQuickTaskRetry = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    runId: v.id("agentRuns"),
    error: v.optional(v.string()),
    delayMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const run = await ctx.db.get(args.runId);
    if (!run || run.taskId !== args.taskId || run.status !== "error")
      return null;
    if (run.exitReason === "auto_retry_scheduled") return null;

    const errorMessage = args.error ?? run.error ?? "";
    // A run held back by a busy task chat (its session's sandbox was mid
    // start/stop at claim time) waits, like a scheduled run, then retries.
    const chatBusy = errorMessage === TASK_CHAT_BUSY_ERROR;
    const retryableFailure =
      chatBusy ||
      isRetryableWatchdogExit(run.exitReason) ||
      (errorMessage.length > 0 && isSandboxNetworkIssue(errorMessage));
    if (!retryableFailure) return null;

    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const sortedRuns = runs.sort(
      (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
    );

    const latestRun = sortedRuns[0];
    if (!latestRun || latestRun._id !== args.runId) return null;

    const previousRun = sortedRuns[1];
    const previousWasRetrySchedule =
      previousRun !== undefined &&
      previousRun.exitReason === "auto_retry_scheduled";
    if (previousWasRetrySchedule) return null;

    const hasOtherActiveRun = sortedRuns.some(
      (candidate) =>
        candidate._id !== args.runId &&
        (candidate.status === "queued" || candidate.status === "running"),
    );
    if (hasOtherActiveRun) return null;

    const delayMs = chatBusy
      ? TASK_CHAT_BUSY_RETRY_MS
      : (args.delayMs ?? buildQuickTaskRetryDelayMs());
    const retry = await scheduleTaskRun(
      ctx,
      args.taskId,
      "scheduleRetry",
      Date.now() + delayMs,
    );
    if (!retry.ok) return null;

    const existingError = run.error ?? "Run failed";
    await ctx.db.patch(args.runId, {
      exitReason: "auto_retry_scheduled",
      error: `${existingError}\n\nAuto-retry scheduled in ${Math.round(delayMs / 1000)}s`,
    });

    return null;
  },
});

/** Runs a task whose schedule (or retry time) came: a task-mode turn in its chat. */
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
    // The run queues in the task's chat; a busy chat just runs it next. A
    // run started before runs became chat turns may still be going.
    if (
      (await hasActiveTaskRun(ctx.db, task)) ||
      (await hasActiveRun(ctx.db, args.taskId))
    ) {
      return null;
    }
    await startTaskRunTurn(ctx, task, { userId: task.createdBy });
    return null;
  },
});

/** Ends the task's run state if no runs are still queued or running. */
export const clearActiveWorkflow = internalMutation({
  // `runId` is optional: workflows started before it existed omit it.
  args: { taskId: v.id("agentTasks"), runId: v.optional(v.id("agentRuns")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const activeRun = await getActiveTaskRun(ctx.db, args.taskId);

    if (!activeRun) {
      // The session chat queue behind the run drains when the run's turn
      // closes (`closeTurn`).
      await finishTaskRun(ctx, args.taskId, args.runId);
    }

    return null;
  },
});
