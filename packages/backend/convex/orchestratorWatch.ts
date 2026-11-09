import { v } from "convex/values";
import {
  authMutation,
  getProjectWithAccess,
  getSessionWithAccess,
  hasTaskAccess,
} from "./functions";
import { assertOwnAveThread } from "./_ave/threads";

/**
 * Points a session at the Manager Ave thread that should be woken when it
 * finishes, or clears the pointer when `aveThreadId` is omitted. Written by
 * the orchestration MCP tools; the notification is fired elsewhere.
 */
export const setSessionWatchedBy = authMutation({
  args: {
    sessionId: v.id("sessions"),
    aveThreadId: v.optional(v.id("aveThreads")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.sessionId, ctx.userId);
    const watchedByAve = await assertOwnAveThread(
      ctx.db,
      args.aveThreadId,
      ctx.userId,
    );
    await ctx.db.patch(args.sessionId, { watchedByAve });
    return null;
  },
});

/** Task counterpart of `setSessionWatchedBy`. */
export const setTaskWatchedBy = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    aveThreadId: v.optional(v.id("aveThreads")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const watchedByAve = await assertOwnAveThread(
      ctx.db,
      args.aveThreadId,
      ctx.userId,
    );
    await ctx.db.patch(args.taskId, { watchedByAve });
    return null;
  },
});

/** Project counterpart of `setSessionWatchedBy`, for its sandbox chat. */
export const setProjectWatchedBy = authMutation({
  args: {
    projectId: v.id("projects"),
    aveThreadId: v.optional(v.id("aveThreads")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
    const watchedByAve = await assertOwnAveThread(
      ctx.db,
      args.aveThreadId,
      ctx.userId,
    );
    await ctx.db.patch(args.projectId, { watchedByAve });
    return null;
  },
});
