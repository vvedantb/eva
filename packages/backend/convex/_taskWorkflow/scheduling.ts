import { v } from "convex/values";
import { startTaskRun } from "./startRun";
import { internalMutation } from "../_generated/server";
import { hasActiveRun, isFirstTaskOnBranch } from "../functions";
import { isDaytonaNetworkIssue, buildQuickTaskRetryDelayMs } from "./recovery";
import { resolveProjectBranchName } from "../_git/branchNames";
import { resolveTaskWorkflowBaseBranchForTask } from "./resolveBaseBranch";
import { startNextQueuedTaskChatMessage } from "../_queues/helpers";
import { scheduleTaskExecutionAt } from "../_scheduling/helpers";

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
    const retryableFailure =
      errorMessage.length > 0 && isDaytonaNetworkIssue(errorMessage);
    if (!retryableFailure) return null;

    if (task.scheduledFunctionId) return null;

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

    const delayMs = args.delayMs ?? buildQuickTaskRetryDelayMs();
    const scheduledAt = Date.now() + delayMs;
    await scheduleTaskExecutionAt(ctx, args.taskId, scheduledAt);

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
    const now = Date.now();

    const clearSchedule: {
      scheduledAt: undefined;
      scheduledFunctionId: undefined;
    } = {
      scheduledAt: undefined,
      scheduledFunctionId: undefined,
    };

    if (task.scheduledAt === undefined) return null;
    if (task.scheduledAt > now) return null;
    if (
      args.scheduledAt !== undefined &&
      task.scheduledAt !== args.scheduledAt
    ) {
      return null;
    }

    if (task.status !== "todo" || !task.repoId || !task.createdBy) {
      await ctx.db.patch(args.taskId, clearSchedule);
      return null;
    }

    if (await hasActiveRun(ctx.db, args.taskId)) {
      await ctx.db.patch(args.taskId, clearSchedule);
      return null;
    }

    const repo = await ctx.db.get(task.repoId);
    if (!repo) {
      await ctx.db.patch(args.taskId, clearSchedule);
      return null;
    }

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

    await ctx.db.patch(args.taskId, clearSchedule);
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

/** Clears the active workflow ID from a task if no runs are still queued or running. */
export const clearActiveWorkflow = internalMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    if (!(await hasActiveRun(ctx.db, args.taskId))) {
      await ctx.db.patch(args.taskId, { activeWorkflowId: undefined });
      // The run is the only thing the task chat queue waits on while a task is
      // running, and nothing else drains it at this point — a follow-up typed
      // during the run would sit there forever. The drain re-checks the task
      // itself, so a chat turn already in flight keeps the queue where it is.
      await startNextQueuedTaskChatMessage(ctx, args.taskId);
    }

    return null;
  },
});
