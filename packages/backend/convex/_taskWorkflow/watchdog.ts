import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { cancelTrackedWorkflow } from "../workflowManager";
import { buildTaskDoneEvent } from "./events";
import { closeOpenTurn } from "../_chat/turnStore";
import { cleanUpStaleRun } from "./recovery";
import { clearTaskRunStreaming, sendCompletionEvent } from "./helpers";
import { RUN_TIMEOUT_MS } from "./staleness";

const RUN_TIMEOUT_MESSAGE = `Run timed out after ${RUN_TIMEOUT_MS / 3_600_000} hours`;

/** Hard-timeout handler that kills a run after `RUN_TIMEOUT_MS`. */
export const handleStaleRun = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    runId: v.id("agentRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    // Keyed on the workflow, not the status: a task the user moved mid-run
    // still has a run to time out. Status resets below only touch
    // `in_progress`, so the user's choice survives.
    if (!task.activeWorkflowId) return null;

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
        errorMessage: RUN_TIMEOUT_MESSAGE,
        exitReason: "run_timeout",
        taskStatus: task.status,
      });
    } else {
      await closeOpenTurn(ctx, args.runId, "error", {
        error: RUN_TIMEOUT_MESSAGE,
      });
      const taskStatus =
        run && run.status === "success" ? "business_review" : "todo";
      await ctx.db.patch(args.taskId, {
        ...(task.status === "in_progress" ? { status: taskStatus } : {}),
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
    }

    await clearTaskRunStreaming(ctx, args.taskId, args.runId, {
      snapshot: true,
    });

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
