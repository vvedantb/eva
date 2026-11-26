import { internal } from "../_generated/api";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Automatic coordinator turns (decision 16). The coordinator wakes by itself
 * only for: a child task's ask (at once), tasks people added and that were
 * handed to it (at once, reason `triage`), a failed task, and the end of an
 * approved batch (both batched in `BATCHED_WAKE_WINDOW_MS`). Nothing else
 * wakes it: finished tasks, merged PRs, plain reports and a person's message
 * in a child task wait for its next turn, where the task table shows them.
 *
 * Each reason is one `projectCoordinatorWakes` row keyed by `key`, so asking
 * twice for the same wake-up is a no-op. A delivery folds every pending row
 * into one message in the coordinator's Main chat, through the chat queue
 * (`coordinatorWakeDelivery.ts`): a busy coordinator reads it after its
 * turn, a sleeping sandbox wakes. There is no hourly cap: each delivery
 * logs `coordinator_wake` so usage can be measured first.
 */

/** Failed tasks and finished batches inside this window share one turn. */
export const BATCHED_WAKE_WINDOW_MS = 2 * 60_000;

type WakeReason = Doc<"projectCoordinatorWakes">["reason"];

/**
 * Asks for a coordinator turn for one reason. Idempotent by `key`: a second
 * request with the same key does nothing. An ask or a handoff is
 * delivered at once; a failure or a finished batch waits for the batch window.
 */
export async function requestCoordinatorWake(
  ctx: MutationCtx,
  request: {
    projectId: Id<"projects">;
    reason: WakeReason;
    key: string;
    text: string;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("projectCoordinatorWakes")
    .withIndex("by_project_and_key", (q) =>
      q.eq("projectId", request.projectId).eq("key", request.key),
    )
    .first();
  if (existing) return;
  await ctx.db.insert("projectCoordinatorWakes", {
    ...request,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(
    request.reason === "ask" || request.reason === "triage"
      ? 0
      : BATCHED_WAKE_WINDOW_MS,
    internal._projects.coordinatorWakeDelivery.deliverCoordinatorWakes,
    { projectId: request.projectId },
  );
}

/** Wake-up rows not delivered yet. */
export async function undeliveredWakes(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Doc<"projectCoordinatorWakes">[]> {
  return await db
    .query("projectCoordinatorWakes")
    .withIndex("by_project_and_sent", (q) =>
      q.eq("projectId", projectId).eq("sentAt", undefined),
    )
    .collect();
}
