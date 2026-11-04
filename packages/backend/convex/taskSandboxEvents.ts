import { v } from "convex/values";
import { authQuery, hasTaskAccess } from "./functions";
import { taskSandboxEventFields } from "./validators";

const taskSandboxEventDocValidator = v.object({
  _id: v.id("taskSandboxEvents"),
  _creationTime: v.number(),
  ...taskSandboxEventFields,
});

/** Lists all sandbox lifecycle events for a task, sorted oldest first. */
export const listByTask = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(taskSandboxEventDocValidator),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const events = await ctx.db
      .query("taskSandboxEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return events.sort((a, b) => a.createdAt - b.createdAt);
  },
});
