import { v } from "convex/values";
import { startTaskRun, taskWorkSessionBusy } from "./startRun";
import { internalMutation } from "../_generated/server";
import {
  getActiveTaskRun,
  hasActiveRun,
  isFirstTaskOnBranch,
} from "../functions";
import {
  buildQuickTaskRetryDelayMs,
  isDaytonaNetworkIssue,
  TASK_CHAT_BUSY_ERROR,
  TASK_CHAT_BUSY_RETRY_MS,
} from "./recovery";
import { resolveProjectBranchName } from "../_git/branchNames";
import { resolveTaskWorkflowBaseBranchForTask } from "./resolveBaseBranch";
import {
  finishTaskRun,
  fireTaskRunSchedule,
  scheduleTaskRun,
} from "../_agentTasks/runState";

/** Schedules an automatic retry for a failed quick task if the failure looks transient. */
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
    if (!task || task.projectId) return null;

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
      (errorMessage.length > 0 && isDaytonaNetworkIssue(errorMessage));
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

/** Executes a previously scheduled task retry by creating a new run and starting the workflow. */
export const executeScheduledTask = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    scheduledAt: v.optional(v.number()),
  },
  returns: v.union(v.id("agentRuns"), v.null()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    // Consumes the schedule. A stale job (replaced, cancelled, not due) stops here.
    const fired = await fireTaskRunSchedule(ctx, args.taskId, args.scheduledAt);
    if (!fired.ok) return null;

    if (task.status !== "todo" || !task.repoId || !task.createdBy) return null;
    if (await hasActiveRun(ctx.db, args.taskId)) return null;
    // The task's (or its project's) chat is mid-reply on the shared sandbox:
    // try again shortly instead of failing the schedule (`startTaskRun`
    // refuses a busy chat).
    if (await taskWorkSessionBusy(ctx.db, task)) {
      await scheduleTaskRun(
        ctx,
        args.taskId,
        "scheduleRetry",
        Date.now() + TASK_CHAT_BUSY_RETRY_MS,
      );
      return null;
    }

    const repo = await ctx.db.get(task.repoId);
    if (!repo) return null;

    const firstOnBranch = await isFirstTaskOnBranch(
      ctx.db,
      args.taskId,
      task.projectId,
    );

    const branchName = task.projectId
      ? resolveProjectBranchName(
          task.projectId,
          await ctx.db.get(task.projectId),
        )
      : undefined;

    const baseBranch = await resolveTaskWorkflowBaseBranchForTask(
      ctx.db,
      task,
      repo,
    );

    const runId = await startTaskRun(ctx, {
      task,
      repo,
      userId: task.createdBy,
      baseBranch,
      isFirstTaskOnBranch: firstOnBranch,
      branchName,
      projectId: task.projectId,
      // Carry through any parked change-request comment so a re-run started via
      // the scheduler is still labelled "made changes" on the timeline.
      triggeringCommentId: task.pendingChangeRequestCommentId,
      clearPendingChangeRequest: true,
      rollbackStatus: "todo",
    });

    return runId;
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
