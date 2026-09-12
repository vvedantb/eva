import { v } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";
import type { GenericDatabaseReader } from "convex/server";
import {
  authMutation,
  getSessionWithAccess,
  hasTaskAccess,
} from "./functions";

/**
 * Resolves the orchestrator session a watch registration points at. Only the
 * caller's own master session may be registered as a watcher, so a stolen id
 * cannot redirect another user's completion notifications.
 */
async function assertOwnOrchestratorSession(
  db: GenericDatabaseReader<DataModel>,
  masterSessionId: Id<"sessions"> | undefined,
  userId: Id<"users">,
): Promise<Id<"sessions"> | undefined> {
  if (masterSessionId === undefined) return undefined;
  const master = await db.get(masterSessionId);
  if (!master) throw new Error("Orchestrator session not found");
  if (master.isOrchestrator !== true) {
    throw new Error("Session is not an orchestrator session");
  }
  if (master.userId !== userId) throw new Error("Not authorized");
  return masterSessionId;
}

/**
 * Points a session at the orchestrator (master) session that should be woken
 * when it finishes, or clears the pointer when `masterSessionId` is omitted.
 * Written by the orchestrator MCP tools; the notification is fired elsewhere.
 */
export const setSessionWatchedBy = authMutation({
  args: {
    sessionId: v.id("sessions"),
    masterSessionId: v.optional(v.id("sessions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.sessionId, ctx.userId);
    const watchedByOrchestrator = await assertOwnOrchestratorSession(
      ctx.db,
      args.masterSessionId,
      ctx.userId,
    );
    await ctx.db.patch(args.sessionId, { watchedByOrchestrator });
    return null;
  },
});

/** Task counterpart of `setSessionWatchedBy`. */
export const setTaskWatchedBy = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    masterSessionId: v.optional(v.id("sessions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const watchedByOrchestrator = await assertOwnOrchestratorSession(
      ctx.db,
      args.masterSessionId,
      ctx.userId,
    );
    await ctx.db.patch(args.taskId, { watchedByOrchestrator });
    return null;
  },
});
