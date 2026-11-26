import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import {
  hasTaskRunTurn,
  taskRunFailedAt,
} from "../_agentTasks/taskRunStatus";
import {
  authQuery,
  hasTaskAccess,
  hasRepoAccess,
  isTaskVisibleTo,
} from "../functions";

/**
 * Whether a failed run is still the task's latest outcome. Follow-up chat
 * turns run in the run's session but create no new run, so a run that failed
 * once would otherwise mark the task as failed forever. The error stays only
 * while no chat turn is live and the latest finished one is the run or failed.
 */
async function isRunErrorCurrent(
  db: GenericDatabaseReader<DataModel>,
  runId: Id<"agentRuns">,
): Promise<boolean> {
  const runTurn = await db
    .query("turns")
    .withIndex("by_entity_open", (q) => q.eq("entityId", runId))
    .first();
  const sessionId = runTurn?.sessionId;
  if (!runTurn || sessionId === undefined) return true;
  const sessionTurns = (open: boolean) =>
    db
      .query("turns")
      .withIndex("by_session_open", (q) =>
        q.eq("sessionId", sessionId).eq("open", open),
      )
      .order("desc");
  // Summary and interview lanes are side jobs, not replies.
  for await (const turn of sessionTurns(true)) {
    if (turn.lane === undefined) return false;
  }
  for await (const turn of sessionTurns(false)) {
    if (turn.lane !== undefined) continue;
    return turn._id === runTurn._id || turn.state === "error";
  }
  return true;
}

/**
 * Whether the caller may read a task named in a batch query that already
 * checked `repoId`. A task in that repo needs only the draft check; any other
 * task falls back to the full access check.
 */
async function canReadBatchTask(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  const task = await db.get(taskId);
  if (!task) return false;
  if (task.repoId === repoId) return isTaskVisibleTo(task, userId);
  return hasTaskAccess(db, task, userId);
}


/** Returns task IDs whose most recent run ended in error. */
export const getTaskIdsWithLatestRunError = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    taskIds: v.array(v.id("agentTasks")),
  },
  returns: v.array(v.id("agentTasks")),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];

    const results = await Promise.all(
      args.taskIds.map(async (taskId) => {
        if (!(await canReadBatchTask(ctx.db, ctx.userId, args.repoId, taskId)))
          return null;
        const task = await ctx.db.get(taskId);
        // A task runs as task-mode turns in its chat; one that has not since
        // runs became chat turns is read off its old run below.
        if (task && (await hasTaskRunTurn(ctx.db, task))) {
          return (await taskRunFailedAt(ctx.db, task)) !== null
            ? taskId
            : null;
        }
        const latestRun = await ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", taskId))
          .order("desc")
          .first();
        if (latestRun?.status !== "error") return null;
        return (await isRunErrorCurrent(ctx.db, latestRun._id))
          ? taskId
          : null;
      }),
    );
    return results.filter((id): id is Id<"agentTasks"> => id !== null);
  },
});
