import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { deploymentStatusValidator, agentRunFields } from "../validators";
import { authQuery, hasTaskAccess, hasRepoAccess } from "../functions";

/** Loads a run and its parent task, enforcing task access. Returns null if the run is missing or inaccessible. */
async function loadAccessibleRun(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  id: Id<"agentRuns">,
): Promise<{ run: Doc<"agentRuns">; task: Doc<"agentTasks"> } | null> {
  const run = await db.get(id);
  if (!run) return null;
  const task = await db.get(run.taskId);
  if (!task || !(await hasTaskAccess(db, task, userId))) return null;
  return { run, task };
}

export const agentRunValidator = v.object({
  _id: v.id("agentRuns"),
  _creationTime: v.number(),
  ...agentRunFields,
});

export const agentRunSummaryValidator = v.object(agentRunValidator.fields);

/** Fetches a single agent run by ID, with access control via task ownership. */
export const get = authQuery({
  args: { id: v.id("agentRuns") },
  returns: v.union(agentRunSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const loaded = await loadAccessibleRun(ctx.db, ctx.userId, args.id);
    if (!loaded) return null;
    return loaded.run;
  },
});

/** Fetches an agent run along with its parent task title and description. */
export const getWithDetails = authQuery({
  args: { id: v.id("agentRuns") },
  returns: v.union(
    v.object({
      ...agentRunSummaryValidator.fields,
      taskTitle: v.string(),
      taskDescription: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const loaded = await loadAccessibleRun(ctx.db, ctx.userId, args.id);
    if (!loaded) return null;
    return {
      ...loaded.run,
      taskTitle: loaded.task.title,
      taskDescription: loaded.task.description,
    };
  },
});

/** Retrieves the activity log text for a specific agent run. */
export const getActivityLog = authQuery({
  args: { id: v.id("agentRuns") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const loaded = await loadAccessibleRun(ctx.db, ctx.userId, args.id);
    if (!loaded) return null;

    const activityLog =
      (await ctx.db
        .query("agentRunActivityLogs")
        .withIndex("by_run_and_type", (q) =>
          q.eq("runId", args.id).eq("type", "run"),
        )
        .first()) ??
      (await ctx.db
        .query("agentRunActivityLogs")
        .withIndex("by_run_and_type", (q) =>
          q.eq("runId", args.id).eq("type", undefined),
        )
        .first());
    return activityLog?.activityLog ?? null;
  },
});

/** Lists all runs for a given task, sorted by most recent first. */
export const listByTask = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(agentRunSummaryValidator),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return runs.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  },
});

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
        const task = await ctx.db.get(taskId);
        if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
          return null;
        }
        const latestRun = await ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", taskId))
          .order("desc")
          .first();
        return latestRun?.status === "error" ? taskId : null;
      }),
    );
    return results.filter((id): id is Id<"agentTasks"> => id !== null);
  },
});

/** Returns the latest deployment status for each task that has one. */
export const getLatestDeploymentStatuses = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    taskIds: v.array(v.id("agentTasks")),
  },
  returns: v.array(
    v.object({
      taskId: v.id("agentTasks"),
      deploymentStatus: deploymentStatusValidator,
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];

    const results = await Promise.all(
      args.taskIds.map(async (taskId) => {
        const task = await ctx.db.get(taskId);
        if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
          return null;
        }
        const latestRunWithDeployment = await ctx.db
          .query("agentRuns")
          .withIndex("by_task", (q) => q.eq("taskId", taskId))
          .order("desc")
          .filter((q) => q.neq(q.field("deploymentStatus"), undefined))
          .first();
        if (latestRunWithDeployment?.deploymentStatus) {
          return {
            taskId,
            deploymentStatus: latestRunWithDeployment.deploymentStatus,
          };
        }
        return null;
      }),
    );
    return results.filter(
      (
        r,
      ): r is {
        taskId: Id<"agentTasks">;
        deploymentStatus: "queued" | "building" | "deployed" | "error";
      } => r !== null,
    );
  },
});

/** Returns the latest run with a deployment status across all tasks in a project. */
export const getLatestDeploymentByProject = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.object({
      deploymentStatus: deploymentStatusValidator,
      deploymentUrl: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId)))
      return null;
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    let latest: {
      deploymentStatus: "queued" | "building" | "deployed" | "error";
      deploymentUrl: string | undefined;
      startedAt: number;
    } | null = null;
    for (const task of tasks) {
      if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) continue;
      const runs = await ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const run of runs) {
        if (
          run.deploymentStatus &&
          (latest === null || (run.startedAt ?? 0) > latest.startedAt)
        ) {
          latest = {
            deploymentStatus: run.deploymentStatus,
            deploymentUrl: run.deploymentUrl,
            startedAt: run.startedAt ?? 0,
          };
        }
      }
    }
    if (!latest) return null;
    return {
      deploymentStatus: latest.deploymentStatus,
      deploymentUrl: latest.deploymentUrl,
    };
  },
});
