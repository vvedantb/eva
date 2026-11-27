import { internal } from "../_generated/api";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** Failed tasks and finished batches inside this window share one turn. */
export const BATCHED_WAKE_WINDOW_MS = 2 * 60_000;

type WakeReason = Doc<"projectCoordinatorWakes">["reason"];

/**
 * Asks for a coordinator turn for one reason. Idempotent by `key`: a second
 * request with the same key does nothing. An ask or a Triage handoff is
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
