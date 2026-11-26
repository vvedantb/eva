import { v } from "convex/values";
import { authQuery, hasTaskAccess } from "../functions";
import { deploymentStatusValidator } from "../validators";
import { findWorkSession } from "../_sessions/owner";
import { taskHasRun } from "./runSummary";
import { hasActiveQuickTaskRun } from "./taskRunStatus";

/**
 * What the task page, card menu and phone need to know about a task's runs,
 * whichever way the task runs: a quick task as task-mode turns in its chat
 * (`taskRunTurn.ts`), a project task as `agentRuns`. One read for both, so
 * the clients never branch on the task kind.
 */
export const getRunFacts = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.union(
    v.object({
      hasRuns: v.boolean(),
      /** A run is going or waiting to start. */
      hasActiveRun: v.boolean(),
      /** The latest run's PR failure (project runs; a quick task's shows in its chat). */
      latestPrError: v.optional(v.string()),
      deploymentStatus: v.optional(deploymentStatusValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return null;
    if (task.projectId === undefined) {
      const session = await findWorkSession(ctx.db, { kind: "task", task });
      return {
        hasRuns: await taskHasRun(ctx.db, task._id),
        hasActiveRun: await hasActiveQuickTaskRun(ctx.db, task),
        deploymentStatus: session?.deploymentStatus,
      };
    }
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    runs.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return {
      hasRuns: runs.length > 0,
      hasActiveRun: runs.some(
        (run) => run.status === "queued" || run.status === "running",
      ),
      latestPrError: runs.find((run) => run.prError)?.prError,
      deploymentStatus: runs.find((run) => run.deploymentStatus)
        ?.deploymentStatus,
    };
  },
});
