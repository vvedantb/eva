import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Leaf module: import only `internal` and types here. functions.ts is loaded by
// "use node" chunks, so app imports would drag workflow code into them.

/** Cancels a scheduled function. A no-op when `id` is undefined or the function already ran. */
export async function cancelScheduledFunction(
  ctx: MutationCtx,
  id: Id<"_scheduled_functions"> | undefined,
): Promise<void> {
  if (!id) return;
  try {
    await ctx.scheduler.cancel(id);
  } catch {
    // may have already fired
  }
}

/** Schedules a task execution at `scheduledAt` and records it on the task. */
export async function scheduleTaskExecutionAt(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  scheduledAt: number,
): Promise<void> {
  const scheduledFunctionId = await ctx.scheduler.runAt(
    scheduledAt,
    internal.taskWorkflow.executeScheduledTask,
    { taskId, scheduledAt },
  );
  await ctx.db.patch(taskId, {
    scheduledAt,
    scheduledFunctionId,
    updatedAt: Date.now(),
  });
}

/** Schedules a project build at `scheduledAt` and records it on the project. */
export async function scheduleProjectBuildAt(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  scheduledAt: number,
): Promise<void> {
  const scheduledBuildFunctionId = await ctx.scheduler.runAt(
    scheduledAt,
    internal.buildWorkflow.executeScheduledBuild,
    { projectId, scheduledAt },
  );
  await ctx.db.patch(projectId, {
    scheduledBuildAt: scheduledAt,
    scheduledBuildFunctionId,
  });
}
