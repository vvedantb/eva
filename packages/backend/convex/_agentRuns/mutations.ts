import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import {
  runStatusValidator,
  logLevelValidator,
  deploymentStatusValidator,
} from "../validators";
import {
  authMutation,
  hasTaskAccess,
  recomputeProjectPhase,
} from "../functions";

/** Loads a run and its parent task, enforcing task access. Throws "Run not found" if the run is missing or inaccessible. */
async function loadAccessibleRun(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  id: Id<"agentRuns">,
): Promise<{ run: Doc<"agentRuns">; task: Doc<"agentTasks"> }> {
  const run = await db.get(id);
  if (!run) throw new Error("Run not found");
  const task = await db.get(run.taskId);
  if (!task || !(await hasTaskAccess(db, task, userId)))
    throw new Error("Run not found");
  return { run, task };
}

/** Updates the status of an in-progress agent run and recomputes project phase if needed. */
export const updateStatus = authMutation({
  args: {
    id: v.id("agentRuns"),
    status: runStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { run, task } = await loadAccessibleRun(ctx.db, ctx.userId, args.id);
    if (run.status === "success" || run.status === "error")
      throw new Error("Cannot update completed run");
    await ctx.db.patch(args.id, { status: args.status });
    if (args.status === "running") {
      await ctx.db.patch(task._id, {
        status: "in_progress",
        updatedAt: Date.now(),
      });
      if (task.projectId) {
        await recomputeProjectPhase(ctx, task.projectId);
      }
    }
    return null;
  },
});

/** Appends a log entry to a running agent run. */
export const appendLog = authMutation({
  args: {
    id: v.id("agentRuns"),
    level: logLevelValidator,
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { run } = await loadAccessibleRun(ctx.db, ctx.userId, args.id);
    if (run.status === "success" || run.status === "error")
      throw new Error("Cannot append to completed run");
    const newLog = {
      timestamp: Date.now(),
      level: args.level,
      message: args.message,
    };
    await ctx.db.patch(args.id, {
      logs: [...run.logs, newLog],
    });
    return null;
  },
});

/**
 * Records media the sandbox harvested for this run (screenshots, recordings).
 *
 * Called by the in-sandbox callback as the run finishes, before the completion
 * mutation: a run is not a chat turn, so there is no `messages` row for
 * `screenshots:attachMedia` to patch. Ids append in capture order, matching how
 * a chat turn accumulates media across a turn.
 */
export const attachMedia = authMutation({
  args: {
    id: v.id("agentRuns"),
    mediaStorageIds: v.array(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.mediaStorageIds.length === 0) return null;
    const { run } = await loadAccessibleRun(ctx.db, ctx.userId, args.id);
    await ctx.db.patch(args.id, {
      mediaStorageIds: [
        ...(run.mediaStorageIds ?? []),
        ...args.mediaStorageIds,
      ],
    });
    return null;
  },
});

/** Marks a run as complete, updates the task status, saves activity log, and notifies relevant users. */
export const complete = authMutation({
  args: {
    id: v.id("agentRuns"),
    success: v.boolean(),
    resultSummary: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    activityLog: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { run, task } = await loadAccessibleRun(ctx.db, ctx.userId, args.id);
    if (run.status === "success" || run.status === "error")
      throw new Error("Run already completed");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.success ? "success" : "error",
      finalizingAt: undefined,
      finishedAt: now,
      resultSummary: args.resultSummary,
      prUrl: args.prUrl,
      error: args.error,
    });

    if (args.activityLog !== undefined) {
      const existingActivityLog = await ctx.db
        .query("agentRunActivityLogs")
        .withIndex("by_run_and_type", (q) =>
          q.eq("runId", args.id).eq("type", "run"),
        )
        .first();
      if (existingActivityLog) {
        await ctx.db.patch(existingActivityLog._id, {
          activityLog: args.activityLog,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("agentRunActivityLogs", {
          runId: args.id,
          activityLog: args.activityLog,
          type: "run",
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(task._id, {
      status: args.success ? "business_review" : "todo",
      updatedAt: now,
    });
    if (task.projectId) {
      await recomputeProjectPhase(ctx, task.projectId);
    }
    // Run success/failure deliberately sends no notification: the task card and
    // chat already show the outcome, so an inbox row per run is pure noise.
    return null;
  },
});

/** Updates the deployment status and optional URL for an agent run (internal use). */
export const updateDeploymentStatus = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    deploymentStatus: deploymentStatusValidator,
    deploymentUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    await ctx.db.patch(args.runId, {
      deploymentStatus: args.deploymentStatus,
      ...(args.deploymentUrl !== undefined && {
        deploymentUrl: args.deploymentUrl,
      }),
    });
    return null;
  },
});
