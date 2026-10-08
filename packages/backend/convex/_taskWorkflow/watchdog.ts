import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { cancelTrackedWorkflow } from "../workflowManager";
import { buildTaskDoneEvent } from "./events";
import { closeOpenTurn } from "../_chat/turnStore";
import { cleanUpStaleRun } from "./recovery";
import {
  clearStreamingActivity,
  getTaskRunStreamingEntityId,
  sendCompletionEvent,
  snapshotStreamingActivityToLog,
} from "./helpers";


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
