import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

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
