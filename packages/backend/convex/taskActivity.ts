import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import { taskActivityFieldValidator, taskActivityFields } from "./validators";
import { authQuery, hasTaskAccess } from "./functions";
import { shouldCoalesceTaskActivity } from "./taskActivityCoalesce";

const taskActivityDocValidator = v.object({
  _id: v.id("taskActivity"),
  _creationTime: v.number(),
  ...taskActivityFields,
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
  // Undefined for system-driven events (e.g. a GitHub PR webhook), which render
  // without an actor avatar in the timeline.
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

  // Newest first — coalesce into the latest matching same-field edit.
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
    // Keep the original oldValue so from→to still reflects the first edit.
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
