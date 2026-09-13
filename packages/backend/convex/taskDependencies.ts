import { v } from "convex/values";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import {
  authQuery,
  authMutation,
  getTaskWithAccess,
  hasTaskAccess,
} from "./functions";

const dependencyValidator = v.object({
  _id: v.id("taskDependencies"),
  _creationTime: v.number(),
  taskId: v.id("agentTasks"),
  dependsOnId: v.id("agentTasks"),
});

/** Retrieves all dependency records for a given task. */
export const getForTask = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(dependencyValidator),
  handler: async (ctx, args) => {
    await getTaskWithAccess(ctx.db, args.taskId, ctx.userId);
    return await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

/** Retrieves all tasks that depend on the given task. */
export const getDependents = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(dependencyValidator),
  handler: async (ctx, args) => {
    await getTaskWithAccess(ctx.db, args.taskId, ctx.userId);
    return await ctx.db
      .query("taskDependencies")
      .withIndex("by_dependency", (q) => q.eq("dependsOnId", args.taskId))
      .collect();
  },
});

/** Returns task details (title, status, taskNumber) for all dependencies of a task. */
export const getDependencies = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(
    v.object({
      _id: v.id("agentTasks"),
      title: v.string(),
      status: v.string(),
      taskNumber: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await getTaskWithAccess(ctx.db, args.taskId, ctx.userId);
    const dependencies = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const result = [];
    for (const dep of dependencies) {
      const task = await ctx.db.get(dep.dependsOnId);
      if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
        continue;
      }
      result.push({
        _id: task._id,
        title: task.title,
        status: task.status,
        taskNumber: task.taskNumber,
      });
    }
    return result;
  },
});

/** Checks whether a task is blocked by any incomplete dependency. */
export const isBlocked = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await getTaskWithAccess(ctx.db, args.taskId, ctx.userId);
    const dependencies = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const dep of dependencies) {
      const dependsOnTask = await ctx.db.get(dep.dependsOnId);
      if (!dependsOnTask) continue;
      if (!(await hasTaskAccess(ctx.db, dependsOnTask, ctx.userId))) {
        return true;
      }
      if (dependsOnTask.status !== "done") {
        return true;
      }
    }
    return false;
  },
});

/** Adds a dependency between two tasks, preventing self-references and duplicates. */
export const add = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    dependsOnId: v.id("agentTasks"),
  },
  returns: v.id("taskDependencies"),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    if (args.taskId === args.dependsOnId) {
      throw new Error("A task cannot depend on itself");
    }
    await Promise.all([
      getTaskWithAccess(ctx.db, args.taskId, ctx.userId),
      getTaskWithAccess(ctx.db, args.dependsOnId, ctx.userId),
    ]);
    const existing = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task_and_depends_on", (q) =>
        q.eq("taskId", args.taskId).eq("dependsOnId", args.dependsOnId),
      )
      .first();
    if (existing) {
      throw new Error("Dependency already exists");
    }
    return await ctx.db.insert("taskDependencies", {
      taskId: args.taskId,
      dependsOnId: args.dependsOnId,
    });
  },
});

/** Removes a task dependency by its document ID. */
export const remove = authMutation({
  args: { id: v.id("taskDependencies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const dep = await ctx.db.get(args.id);
    if (!dep) {
      throw new Error("Dependency not found");
    }
    await Promise.all([
      getTaskWithAccess(ctx.db, dep.taskId, ctx.userId),
      getTaskWithAccess(ctx.db, dep.dependsOnId, ctx.userId),
    ]);
    await ctx.db.delete(args.id);
    return null;
  },
});

/** Removes a task dependency by looking up the task and dependsOn pair. */
export const removeByTasks = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    dependsOnId: v.id("agentTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await Promise.all([
      getTaskWithAccess(ctx.db, args.taskId, ctx.userId),
      getTaskWithAccess(ctx.db, args.dependsOnId, ctx.userId),
    ]);
    const dep = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task_and_depends_on", (q) =>
        q.eq("taskId", args.taskId).eq("dependsOnId", args.dependsOnId),
      )
      .first();
    if (dep) {
      await ctx.db.delete(dep._id);
    }
    return null;
  },
});
