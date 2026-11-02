import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { logLevelValidator, deploymentStatusValidator } from "../validators";
import { authMutation, hasTaskAccess } from "../functions";

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
