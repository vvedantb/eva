import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { cancelTrackedWorkflow } from "../workflowManager";
import { buildTaskDoneEvent } from "./events";
import { closeOpenTurn } from "../_chat/turnStore";
import {
  cleanUpStaleRun,
  STALE_THRESHOLD_MS,
  STALE_RECHECK_MS,
  STALE_FINISHING_THRESHOLD_MS,
  STALE_NO_SANDBOX_THRESHOLD_MS,
} from "./recovery";
import {
  clearStreamingActivity,
  getTaskRunStreamingEntityId,
  sendCompletionEvent,
  snapshotStreamingActivityToLog,
} from "./helpers";
import {
  hasActiveAgentToolStep,
  isFinalizingActivity,
  isSandboxStartupActivity,
} from "./staleness";

// Startup/tool/finalizing detection lives in ./staleness (pure module shared
// with the session watchdog in workflowWatchdog.ts).

/**
 * Periodically checks if a run has gone stale and cleans it up or reschedules another check.
 *
 * Liveness gate: when a run is stale but has a sandbox attached, we first schedule
 * a one-time liveness probe (`verifySandboxLiveness`) before killing. The probe
 * checks the sandbox state + callback PID. If both are alive the run gets one
 * grace cycle (another `STALE_RECHECK_MS` window with `skipLivenessProbe: true`)
 * so transient heartbeat transport failures do not kill a demonstrably-live run.
 * If still stale at the end of that grace cycle the kill proceeds. The hard
 * 2-hour `handleStaleRun` timeout is the ultimate backstop.
 */
export const checkStaleRuns = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    taskId: v.id("agentTasks"),
    // Set by the liveness probe when it already granted a grace cycle for the
    // current stale event. Suppresses a second probe so we can't loop forever
    // on a sandbox that is alive-but-zombie.
    skipLivenessProbe: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return null;

    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    if (!task.activeWorkflowId) {
      console.log(
        `[watchdog][kill] runId=${args.runId} reason=workflow_tracking_lost skipProbe=${args.skipLivenessProbe ?? false}`,
      );
      await cleanUpStaleRun(ctx, {
        taskId: args.taskId,
        runId: args.runId,
        isProjectTask: !!task.projectId,
        errorMessage: "Run killed by watchdog: workflow tracking lost",
        exitReason: "workflow_tracking_lost",
        taskStatus: task.status,
      });
      return null;
    }

    if (!run.sandboxId) {
      const startedAt = run.startedAt ?? Date.now();
      const sandboxAttachTimedOut =
        Date.now() - startedAt > STALE_NO_SANDBOX_THRESHOLD_MS;

      if (!sandboxAttachTimedOut) {
        await ctx.scheduler.runAfter(
          STALE_RECHECK_MS,
          internal.taskWorkflow.checkStaleRuns,
          { runId: args.runId, taskId: args.taskId },
        );
        return null;
      }

      console.log(
        `[watchdog][kill] runId=${args.runId} reason=watchdog_no_sandbox ageSinceStart=${Date.now() - startedAt}ms`,
      );
      await cleanUpStaleRun(ctx, {
        taskId: args.taskId,
        runId: args.runId,
        isProjectTask: !!task.projectId,
        errorMessage: "Run killed by watchdog: sandbox was never attached",
        exitReason: "watchdog_no_sandbox",
        activeWorkflowId: task.activeWorkflowId,
        taskStatus: task.status,
      });
      return null;
    }

    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) =>
        q.eq("entityId", getTaskRunStreamingEntityId(args.runId)),
      )
      .first();
    const startupStillInProgress = isSandboxStartupActivity(
      streaming?.currentActivity,
      { hasSandbox: !!run.sandboxId, runStartedAt: run.startedAt },
    );
    const finishingInProgress =
      run.finalizingAt !== undefined ||
      isFinalizingActivity(streaming?.currentActivity);
    const toolActive =
      !startupStillInProgress &&
      !finishingInProgress &&
      hasActiveAgentToolStep(streaming?.currentActivity);
    const lastActivity = Math.max(
      streaming?.lastUpdatedAt ?? 0,
      run.startedAt ?? 0,
      run.finalizingAt ?? 0,
    );
    // A silent long tool is not exempt from the ordinary threshold: the 10s
    // transport ping is heartbeat enough, and the liveness probe below (not a
    // longer window) is what protects a live build from transport flaps.
    const staleThresholdMs = startupStillInProgress
      ? STALE_NO_SANDBOX_THRESHOLD_MS
      : finishingInProgress
        ? STALE_FINISHING_THRESHOLD_MS
        : STALE_THRESHOLD_MS;
    const staleSeconds = Math.round(staleThresholdMs / 1000);
    const streamingAgeMs = Date.now() - lastActivity;
    const isStale = streamingAgeMs > staleThresholdMs;

    if (!isStale) {
      // The run is alive — push the sandbox's hard session deadline out so
      // the provider's runtime cap can never kill live work mid-run (same
      // contract as the chat stall watchdog; see extendSandboxDeadline).
      if (run.repoId) {
        await ctx.scheduler.runAfter(
          0,
          internal.sandbox.extendSandboxDeadline,
          {
            sandboxId: run.sandboxId,
            repoId: run.repoId,
            durationMs: STALE_RECHECK_MS * 2,
          },
        );
      }
      await ctx.scheduler.runAfter(
        STALE_RECHECK_MS,
        internal.taskWorkflow.checkStaleRuns,
        { runId: args.runId, taskId: args.taskId },
      );
      return null;
    }

    // Stale. If we have a sandbox + haven't probed yet + we're not in the
    // startup phase (where the callback isn't guaranteed to exist yet), run a
    // liveness probe before killing. The probe action decides whether to grant
    // a grace cycle or proceed to the kill.
    if (!args.skipLivenessProbe && !startupStillInProgress && run.repoId) {
      await ctx.scheduler.runAfter(
        0,
        internal.taskWorkflow.probeStaleRunLiveness,
        {
          runId: args.runId,
          taskId: args.taskId,
          sandboxId: run.sandboxId,
          repoId: run.repoId,
          streamingAgeMs,
          finishingInProgress,
        },
      );
      return null;
    }

    const errorMessage = startupStillInProgress
      ? "Run killed by watchdog: sandbox startup stalled"
      : finishingInProgress
        ? `Run killed by watchdog: finalization stalled (no heartbeat for ${staleSeconds}s)`
        : `Run killed by watchdog: no heartbeat for ${staleSeconds}s`;
    const exitReason = startupStillInProgress
      ? "watchdog_startup_stalled"
      : finishingInProgress
        ? "watchdog_finalizing_stalled"
        : "watchdog_killed";

    console.log(
      `[watchdog][kill] runId=${args.runId} reason=${exitReason} streamingAgeMs=${streamingAgeMs} thresholdMs=${staleThresholdMs} skipProbe=${args.skipLivenessProbe ?? false} startup=${startupStillInProgress} toolActive=${toolActive} finishing=${finishingInProgress} activity=${JSON.stringify(streaming?.currentActivity ?? "").slice(0, 200)}`,
    );

    await cleanUpStaleRun(ctx, {
      taskId: args.taskId,
      runId: args.runId,
      sandboxId: run.sandboxId,
      repoId: run.repoId,
      isProjectTask: !!task.projectId,
      errorMessage,
      exitReason,
      activeWorkflowId: task.activeWorkflowId,
      taskStatus: task.status,
    });
    return null;
  },
});

/** Hard-timeout handler that kills a run after the maximum allowed duration (2 hours). */
export const handleStaleRun = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    runId: v.id("agentRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    if (task.status !== "in_progress" || !task.activeWorkflowId) return null;

    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const latestRun = runs.sort(
      (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
    )[0];
    if (latestRun && latestRun._id !== args.runId) return null;

    await cancelTrackedWorkflow(ctx, task.activeWorkflowId);

    const run = await ctx.db.get(args.runId);

    if (run && (run.status === "queued" || run.status === "running")) {
      await cleanUpStaleRun(ctx, {
        taskId: args.taskId,
        runId: args.runId,
        sandboxId: run.sandboxId,
        repoId: run.repoId,
        isProjectTask: !!task.projectId,
        errorMessage: "Run timed out after 2 hours",
        exitReason: "run_timeout",
        taskStatus: task.status,
      });
    } else {
      await closeOpenTurn(ctx, args.runId, "error", {
        error: "Run timed out after 2 hours",
      });
      const taskStatus =
        run && run.status === "success" ? "business_review" : "todo";
      await ctx.db.patch(args.taskId, {
        status: taskStatus,
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
    }

    await snapshotStreamingActivityToLog(
      ctx,
      getTaskRunStreamingEntityId(args.runId),
      args.runId,
    );
    await clearStreamingActivity(ctx, getTaskRunStreamingEntityId(args.runId));
    await clearStreamingActivity(ctx, String(args.taskId));

    if (task.projectId) {
      const project = await ctx.db.get(task.projectId);
      if (project?.activeBuildWorkflowId) {
        try {
          await sendCompletionEvent(
            ctx,
            buildTaskDoneEvent,
            project.activeBuildWorkflowId,
            { taskId: args.taskId, success: false },
          );
        } catch {}
      }
    }

    return null;
  },
});
