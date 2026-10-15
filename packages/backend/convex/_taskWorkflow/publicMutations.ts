import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { WorkflowId } from "@convex-dev/workflow";
import { cancelTrackedWorkflow, toWorkflowId } from "../workflowManager";
import { authMutation, getActiveTaskRun, hasTaskAccess } from "../functions";
import {
  advanceTurn,
  closeOpenTurn,
  resolveCompletionTurn,
} from "../_chat/turnStore";
import { TURN_FINALIZING_LEASE_MS } from "../_chat/turnLease";
import {
  completionCallbackArgs,
  turnLeaseFenceArgs,
} from "../validators";
import { taskCompleteEvent } from "./events";
import {
  clearStreamingActivity,
  getTaskRunStreamingEntityId,
  recordCompletionLog,
  sendCompletionEvent,
} from "./helpers";
import { scheduleTaskOrchestratorNotify } from "../orchestratorShared";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { errorText } from "../_shared/errors";

/** Retrieves the active workflow ID for a task, or null if none exists. */
async function getActiveWorkflowId(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<WorkflowId | null> {
  const task = await ctx.db.get(taskId);
  if (!task?.activeWorkflowId) return null;
  return toWorkflowId(task.activeWorkflowId);
}

/** Returns the most recently started running task run for a task, or null if none remain. */
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

/** Logs and ignores a completion callback that belongs to a run which is no longer active. */
function ignoreStaleCompletionCallback(reason: string): null {
  console.warn(`[taskWorkflow] Ignoring stale completion callback: ${reason}`);
  return null;
}

/** Receives the task completion callback, validates it, marks the run as finalizing, and forwards the event to the workflow. */
export const handleCompletion = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    runId: v.optional(v.id("agentRuns")),
    ...completionCallbackArgs,
    // The run's lease, sent by every callback launched with one.
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
    // Every run has a turn now, and its callback always sends the lease.
    if (turn.status !== "current") {
      return ignoreStaleCompletionCallback(
        `run ${String(args.runId)} completion holds no current lease`,
      );
    }
    await advanceTurn(ctx, turn.turn, "finalizing");
    // Push, PR and deployment tracking run after the agent exits, and no
    // heartbeat renews the lease then. Keep the sandbox up for them.
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

    try {
      await sendCompletionEvent(ctx, taskCompleteEvent, workflowId, {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
      });
    } catch (error) {
      await ctx.db.patch(latestRunningRun._id, {
        finalizingAt: undefined,
      });
      const detail = errorText(error);
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

/** Cancels the active workflow and run for a task, resetting it to todo status. */
export const cancelExecution = authMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await cancelTrackedWorkflow(ctx, task.activeWorkflowId);

    const run = await getActiveTaskRun(ctx.db, args.taskId);

    if (run) {
      await closeOpenTurn(ctx, run._id, "cancelled");
      await ctx.db.patch(run._id, {
        status: "cancelled",
        finalizingAt: undefined,
        finishedAt: Date.now(),
      });
      await clearStreamingActivity(ctx, getTaskRunStreamingEntityId(run._id));
      // The cancelled status is written here, not through finalizeRunStatus, so
      // this is the one terminal transition that hook cannot see.
      await scheduleTaskOrchestratorNotify(ctx, args.taskId, "cancelled");

      // workflow.cancel() aborts execution before the workflow's own sandbox
      // cleanup step runs, so we stop the execution sandbox here.
      if (run.sandboxId && run.repoId) {
        await ctx.scheduler.runAfter(0, internal.sandbox.stopSandbox, {
          sandboxId: run.sandboxId,
          repoId: run.repoId,
        });
      }
    }

    await clearStreamingActivity(ctx, String(args.taskId));

    await ctx.db.patch(args.taskId, {
      status: "todo",
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });

    return null;
  },
});
