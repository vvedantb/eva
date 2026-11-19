import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { cancelTrackedWorkflow } from "../workflowManager";
import { RUN_TIMEOUT_MS } from "../workflowWatchdog";
import { finishTaskRun, taskRunWorkflowId } from "../_agentTasks/runState";

/** Finds and resets stale in-progress tasks and their timed-out runs. */
export const cleanupStaleRuns = internalMutation({
  args: {},
  returns: v.object({ tasksFixed: v.number(), runsFixed: v.number() }),
  handler: async (ctx) => {
    let tasksFixed = 0;
    let runsFixed = 0;
    const cutoff = Date.now() - RUN_TIMEOUT_MS;

    const allTasks = await ctx.db.query("agentTasks").collect();
    const stuckTasks = allTasks.filter((t) => t.status === "in_progress");

    for (const task of stuckTasks) {
      const runs = await ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();

      const activeRuns = runs.filter(
        (r) => r.status === "queued" || r.status === "running",
      );
      const hasFreshActiveRun = activeRuns.some(
        (r) => (r.startedAt ?? 0) >= cutoff,
      );
      const staleActiveRuns = activeRuns.filter(
        (r) => (r.startedAt ?? 0) < cutoff,
      );

      if (hasFreshActiveRun) continue;

      if (
        activeRuns.length === 0 &&
        !runs.some((r) => r.status === "success" || r.status === "error")
      )
        continue;

      await cancelTrackedWorkflow(ctx, taskRunWorkflowId(task));

      for (const staleRun of staleActiveRuns) {
        await ctx.db.patch(staleRun._id, {
          status: "error",
          error: "Cleaned up stale run",
          finishedAt: Date.now(),
        });
        runsFixed++;
      }

      const hasSuccessRun = runs.some((r) => r.status === "success");
      await ctx.db.patch(task._id, {
        status: hasSuccessRun ? "code_review" : "todo",
        updatedAt: Date.now(),
      });
      await finishTaskRun(ctx, task._id, undefined);
      tasksFixed++;

      const streaming = await ctx.db
        .query("streamingActivity")
        .withIndex("by_entity", (q) => q.eq("entityId", String(task._id)))
        .first();
      if (streaming) await ctx.db.delete(streaming._id);
    }

    return { tasksFixed, runsFixed };
  },
});
