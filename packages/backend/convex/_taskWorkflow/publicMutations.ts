import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { WorkflowId } from "@convex-dev/workflow";
import { cancelTrackedWorkflow, toWorkflowId } from "../workflowManager";
import {
  authMutation,
  getActiveTaskRun,
  onProjectTasksChanged,
} from "../functions";
import {
  advanceTurn,
  closeOpenTurn,
  resolveCompletionTurn,
} from "../_chat/turnStore";
import { TURN_FINALIZING_LEASE_MS } from "../_chat/turnLease";
import { turnCheckpointArgs, turnLeaseFenceArgs } from "../validators";
import { taskCompleteEvent } from "./events";
import {
  clearStreamingActivity,
  getTaskRunStreamingEntityId,
  recordCompletionLog,
  sendCompletionEvent,
} from "./helpers";
import { scheduleTaskOrchestratorNotify } from "../orchestratorShared";
import { finishTaskRun, taskRunWorkflowId } from "../_agentTasks/runState";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { errorMessage } from "@vvedantb/server";
import { findWorkSession } from "../_sessions/owner";
import { abandonTaskRunSandbox } from "../_sessions/sandbox";
import { closeTaskReports, runEndedOnAsk } from "../_projects/reports";

async function getActiveWorkflowId(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<WorkflowId | null> {
  const task = await ctx.db.get(taskId);
  const workflowId = task ? taskRunWorkflowId(task) : undefined;
  return workflowId === undefined ? null : toWorkflowId(workflowId);
}

async function getLatestRunningTaskRun(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<Doc<"agentRuns"> | null> {
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  return (
    runs
      .filter((run) => run.status === "running")
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null
  );
}

function ignoreStaleCompletionCallback(reason: string): null {
  console.warn(`[taskWorkflow] Ignoring stale completion callback: ${reason}`);
  return null;
}

/** Receives the task completion callback, validates it, marks the run as finalizing, and forwards the event to the workflow. */
export const handleCompletion = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    runId: v.optional(v.id("agentRuns")),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    ...turnCheckpointArgs,
    ...turnLeaseFenceArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return ignoreStaleCompletionCallback(
        `task ${String(args.taskId)} no longer exists`,
      );
    }
    if (!args.runId) {
      return ignoreStaleCompletionCallback(
        `task ${String(args.taskId)} completion arrived without runId`,
      );
    }
    const workflowId = await getActiveWorkflowId(ctx, args.taskId);
    if (!workflowId) {
      return ignoreStaleCompletionCallback(
        `task ${String(args.taskId)} has no active workflow`,
      );
    }
    const callbackRun = await ctx.db.get(args.runId);
    if (!callbackRun || callbackRun.taskId !== args.taskId) {
      return ignoreStaleCompletionCallback(
        `run ${String(args.runId)} is missing or belongs to another task`,
      );
    }
    if (callbackRun.status !== "running") {
      return ignoreStaleCompletionCallback(
        `run ${String(args.runId)} is already ${callbackRun.status}`,
      );
    }
    const latestRunningRun = await getLatestRunningTaskRun(ctx, args.taskId);
    if (!latestRunningRun) {
      return ignoreStaleCompletionCallback(
        `task ${String(args.taskId)} no longer has a running run`,
      );
    }
    if (latestRunningRun._id !== args.runId) {
      return ignoreStaleCompletionCallback(
        `run ${String(args.runId)} lost the race to active run ${String(latestRunningRun._id)}`,
      );
    }

    const turn = await resolveCompletionTurn(ctx, {
      entityId: args.runId,
      turnId: args.turnId,
      leaseGeneration: args.leaseGeneration,
    });
    if (turn.status !== "current") {
      return ignoreStaleCompletionCallback(
        `run ${String(args.runId)} completion holds no current lease`,
      );
    }
    await advanceTurn(ctx, turn.turn, "finalizing");
    if (turn.turn.sandboxId !== undefined) {
      await ctx.scheduler.runAfter(0, internal.sandbox.extendSandboxDeadline, {
        sandboxId: turn.turn.sandboxId,
        repoId: turn.turn.repoId,
        durationMs: 2 * TURN_FINALIZING_LEASE_MS,
      });
    }

    await ctx.db.patch(latestRunningRun._id, {
      finalizingAt: Date.now(),
    });

    const endedOnAsk = await runEndedOnAsk(ctx.db, latestRunningRun);
    try {
      await sendCompletionEvent(ctx, taskCompleteEvent, workflowId, {
        success: endedOnAsk || args.success,
        result: args.result,
        error: endedOnAsk ? null : args.error,
        activityLog: args.activityLog,
      });
    } catch (error) {
      await ctx.db.patch(latestRunningRun._id, {
        finalizingAt: undefined,
      });
      const detail = errorMessage(error);
      console.error(
        `[taskWorkflow] handleCompletion: workflow.sendEvent failed after finalizing; run=${String(args.runId)} task=${String(args.taskId)}: ${detail}`,
      );
      throw new Error(`Failed to deliver completion event: ${detail}`);
    }

    if (task.repoId) {
      await recordCompletionLog(ctx, {
        entityType: "quickTask",
        entityId: String(args.taskId),
        entityTitle: task.title,
        repoId: task.repoId,
        rawResultEvent: args.rawResultEvent,
        projectId: task.projectId,
      });
    }

    return null;
  },
});

/**
 * Stops a task's agent run, resetting an `in_progress` task to todo. Reached
 * through the one chat Stop (`_sessions/stop.ts`); the caller checks access.
 */
export async function cancelTaskRun(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<void> {
  await cancelTrackedWorkflow(ctx, taskRunWorkflowId(task));

  const run = await getActiveTaskRun(ctx.db, task._id);

  if (run) {
    await closeOpenTurn(ctx, run._id, "cancelled");
    await ctx.db.patch(run._id, {
      status: "cancelled",
      finalizingAt: undefined,
      finishedAt: Date.now(),
    });
    await clearStreamingActivity(ctx, getTaskRunStreamingEntityId(run._id));
    await scheduleTaskOrchestratorNotify(ctx, task._id, "cancelled");

    const session = await findWorkSession(ctx.db, task);
    if (session) {
      await abandonTaskRunSandbox(ctx, session._id, run);
    } else if (run.sandboxId && run.repoId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.stopSandbox, {
        sandboxId: run.sandboxId,
        repoId: run.repoId,
      });
    }
  }

  await clearStreamingActivity(ctx, String(task._id));

  await ctx.db.patch(task._id, {
      ...(task.status === "in_progress" ? { status: "todo" as const } : {}),
    updatedAt: Date.now(),
  });
  await finishTaskRun(ctx, task._id, undefined);
  if (task.projectId !== undefined) {
    await closeTaskReports(ctx, task._id);
    await onProjectTasksChanged(ctx, task.projectId);
  }
}

