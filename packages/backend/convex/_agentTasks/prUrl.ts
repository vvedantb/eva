import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Runs looked at per task when finding the PR that task opened. */
const TASK_PR_RUN_LOOKBACK = 3;

/** The PR a quick task opened. It lives on the run, never on the task row. */
export async function latestTaskPrUrl(
  ctx: QueryCtx,
  taskId: Id<"agentTasks">,
): Promise<string | undefined> {
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .order("desc")
    .take(TASK_PR_RUN_LOOKBACK);
  return runs.find((run) => run.prUrl)?.prUrl;
}
