import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * How long to wait before re-issuing a sandbox stop when the finalize action
 * died with a Convex transient error. Actions are not auto-retried — without a
 * re-issue, a "Transient error while executing action" (0ms) leaves the entity
 * stuck on "stopping" forever. Shared by the session, task, and project stop
 * paths (each has its own recoverStuckStopping mutation).
 */
export const STUCK_STOPPING_RECOVER_MS = 20_000;

/**
 * Re-offers the chat queue once a stop settles. A message sent while the
 * sandbox was stopping found it "transitioning" and waited, but no later event
 * drained it: a stop that closed never woke Eva, and a failed stop reverted to
 * active silently. The quiet drain wakes a closed sandbox only when a message
 * is waiting, so an empty queue stays asleep. Shared by the session, task, and
 * project `mark*Closed` mutations; scheduled, not imported, to avoid the cycle
 * with `_queues/helpers`.
 */
export async function scheduleDrainAfterStopSettles(
  ctx: MutationCtx,
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal._queues.helpers.drainQueueQuietly, {
    parentId,
  });
}
