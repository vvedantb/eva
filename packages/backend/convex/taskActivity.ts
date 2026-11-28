import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import { taskActivityFieldValidator } from "./validators";
import { authQuery, hasTaskAccess } from "./functions";
import { shouldCoalesceTaskActivity } from "./taskActivityCoalesce";

const taskActivityDocValidator = v.object({
  _id: v.id("taskActivity"),
  _creationTime: v.number(),
  taskId: v.id("agentTasks"),
  field: taskActivityFieldValidator,
  oldValue: v.optional(v.string()),
  newValue: v.optional(v.string()),
  userId: v.optional(v.id("users")),
  createdAt: v.number(),
});

export const listByTask = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(taskActivityDocValidator),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) return [];
    const events = await ctx.db
      .query("taskActivity")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return events.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export async function logTaskActivity(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  userId: Id<"users"> | undefined,
  field: Infer<typeof taskActivityFieldValidator>,
  oldValue: string | undefined,
  newValue: string | undefined,
): Promise<void> {
  if (oldValue === newValue) return;

  const now = Date.now();
  const events = await ctx.db
    .query("taskActivity")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  const recent = events.toSorted((a, b) => b.createdAt - a.createdAt);
  for (const event of recent) {
    if (
      !shouldCoalesceTaskActivity(
        {
          field: event.field,
          userId: event.userId,
          createdAt: event.createdAt,
        },
        { field, userId, now },
      )
    ) {
      continue;
    }
    await ctx.db.patch(event._id, {
      newValue,
      createdAt: now,
    });
    return;
  }

  await ctx.db.insert("taskActivity", {
    taskId,
    field,
    oldValue,
    newValue,
    userId,
    createdAt: now,
  });
}
