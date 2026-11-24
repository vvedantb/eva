import { internal } from "../_generated/api";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Automatic coordinator turns (decision 16). The coordinator wakes by itself
 * only for: a child task's ask (at once), a failed task, and the end of an
 * approved batch (both batched in `BATCHED_WAKE_WINDOW_MS`). Nothing else
 * wakes it: finished tasks, merged PRs, plain reports, a person's message in a
 * child task and new Triage tasks wait for its next turn, where the task
 * table shows them.
 *
 * Each reason is one `projectCoordinatorWakes` row keyed by `key`, so asking
 * twice for the same wake-up is a no-op. A delivery folds every pending row
 * into one message in the coordinator's Main chat, through the chat queue
 * (`coordinatorWakeDelivery.ts`): a busy coordinator reads it after its
 * turn, a sleeping sandbox wakes. At `MAX_COORDINATOR_AUTO_TURNS_PER_HOUR` the rows
 * are held instead; the project then shows "needs you" until a person writes
 * in the coordinator chat (`releaseHeldCoordinatorWakes`). A person's message
 * never counts against the cap.
 */

/** Automatic coordinator turns one project may have in an hour. */
export const MAX_COORDINATOR_AUTO_TURNS_PER_HOUR = 10;

/** Failed tasks and finished batches inside this window share one turn. */
export const BATCHED_WAKE_WINDOW_MS = 2 * 60_000;

const HOUR_MS = 60 * 60_000;

type WakeReason = Doc<"projectCoordinatorWakes">["reason"];

/**
 * Asks for a coordinator turn for one reason. Idempotent by `key`: a second
 * request with the same key does nothing. An ask is delivered at once; a
 * failure or a finished batch waits for the batch window.
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
    request.reason === "ask" ? 0 : BATCHED_WAKE_WINDOW_MS,
    internal._projects.coordinatorWakeDelivery.deliverCoordinatorWakes,
    { projectId: request.projectId },
  );
}

/** Wake-up rows not delivered yet (held ones included). */
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

/**
 * Automatic turns the project had in the hour before `now`. One delivery
 * stamps all its rows with the same `sentAt`, so each distinct time is one
 * turn. Rows a person's message released keep their `heldAt` and do not
 * count.
 */
export async function coordinatorAutoTurnsInLastHour(
  db: DatabaseReader,
  projectId: Id<"projects">,
  now: number,
): Promise<number> {
  const sent = await db
    .query("projectCoordinatorWakes")
    .withIndex("by_project_and_sent", (q) =>
      q.eq("projectId", projectId).gte("sentAt", now - HOUR_MS),
    )
    .collect();
  return new Set(
    sent.filter((row) => row.heldAt === undefined).map((row) => row.sentAt),
  ).size;
}

/**
 * True while the hourly cap holds a wake-up back: the project shows "needs
 * you" and its coordinator waits for a person.
 */
export async function isCoordinatorPaused(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<boolean> {
  return (await undeliveredWakes(db, projectId)).some(
    (row) => row.heldAt !== undefined,
  );
}

/**
 * A person wrote in the coordinator chat: wake-ups the cap held are folded
 * into that turn (its task table shows the same facts), so the project stops
 * showing "needs you" for them.
 */
export async function releaseHeldCoordinatorWakes(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const now = Date.now();
  for (const row of await undeliveredWakes(ctx.db, projectId)) {
    if (row.heldAt !== undefined) await ctx.db.patch(row._id, { sentAt: now });
  }
}
