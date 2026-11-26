import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  authQuery,
  hasRepoAccess,
  hasTaskAccess,
  isTaskVisibleTo,
} from "../functions";
import { deploymentStatusValidator } from "../validators";
import { findWorkSession } from "../_sessions/owner";
import { taskHasRun } from "./runSummary";
import { hasActiveTaskRun, taskRunFailure } from "./taskRunStatus";

/**
 * What the task page, card menu and phone need to know about a task's runs:
 * the task-mode turns in its chat (`taskRunTurn.ts`). One read for quick and
 * project tasks, so the clients never branch on the task kind. A PR that
 * failed to open shows as an alert in the chat, not here.
 */
export const getRunFacts = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.union(
    v.object({
      hasRuns: v.boolean(),
      /** A run is going or waiting to start. */
      hasActiveRun: v.boolean(),
      deploymentStatus: v.optional(deploymentStatusValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return null;
    const [session, hasRuns, hasActiveRun] = await Promise.all([
      findWorkSession(ctx.db, { kind: "task", task }),
      taskHasRun(ctx.db, task._id),
      hasActiveTaskRun(ctx.db, task),
    ]);
    return {
      hasRuns,
      hasActiveRun,
      deploymentStatus: session?.deploymentStatus,
    };
  },
});

/**
 * The tasks, of those named, whose last run failed and that is still their
 * latest outcome (`taskRunFailure`): the failed badge on task lists and
 * project panels. A task of `repoId` needs only the draft check; any other
 * task the full access check.
 */
export const getTaskIdsWithFailedRun = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    taskIds: v.array(v.id("agentTasks")),
  },
  returns: v.array(v.id("agentTasks")),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const failed = await Promise.all(
      args.taskIds.map(async (taskId): Promise<Id<"agentTasks"> | null> => {
        const task = await ctx.db.get(taskId);
        if (!task) return null;
        const visible =
          task.repoId === args.repoId
            ? isTaskVisibleTo(task, ctx.userId)
            : await hasTaskAccess(ctx.db, task, ctx.userId);
        if (!visible) return null;
        return (await taskRunFailure(ctx.db, task)) !== null ? taskId : null;
      }),
    );
    return failed.filter((id): id is Id<"agentTasks"> => id !== null);
  },
});
