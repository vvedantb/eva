import type { Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";

/** Whether the task has ever run: its summary records every run's start. */
export async function taskHasRun(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  const summary = await db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique();
  return summary?.lastRunStartedAt !== undefined;
}

/** Inserts the no-runs sentinel row for a newly created task. */
export async function createTaskRunSummary(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  repoId: Id<"githubRepos">,
): Promise<void> {
  await ctx.db.insert("agentTaskRunSummaries", { taskId, repoId });
}

/** Upserts the small latest-run row used by task list queries. */
export async function setTaskLastRunStartedAt(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  repoId: Id<"githubRepos">,
  lastRunStartedAt: number,
): Promise<void> {
  const summary = await ctx.db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique();
  if (summary) {
    await ctx.db.patch(summary._id, { repoId, lastRunStartedAt });
    return;
  }
  await ctx.db.insert("agentTaskRunSummaries", {
    taskId,
    repoId,
    lastRunStartedAt,
  });
}

/** Keeps the summary's repo key correct when a task moves between repos. */
export async function moveTaskRunSummary(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  repoId: Id<"githubRepos">,
): Promise<void> {
  const summary = await ctx.db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique();
  if (summary) {
    await ctx.db.patch(summary._id, { repoId });
  }
}
