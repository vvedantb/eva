/**
 * Which quick-task drafts the modal is allowed to show, and what the local
 * store should hold the instant Remove is pressed.
 *
 * `api.agentTasks.remove` is a soft delete: it stamps `deletedAt` and leaves
 * the row on disk. So "deleted" is a predicate the client has to apply, not a
 * fact it can read off the presence of a row — the bug behind fix 613e5d8cc,
 * where a removed draft came straight back on the next subscription push and
 * the trash button looked dead.
 *
 * Both the render path and the optimistic update go through here so the two
 * cannot drift on what counts as gone.
 */

/** A soft-deleted draft is still on disk, so absence is not the test. */
export function visibleDrafts<T extends { deletedAt?: number }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.deletedAt === undefined);
}

/**
 * The list to paint while `remove` is in flight.
 *
 * Drops the row by id — the server has not stamped `deletedAt` yet, so the
 * visibility predicate alone would leave it on screen — and re-applies that
 * predicate, so a row already carrying `deletedAt` cannot ride back in.
 */
export function draftsAfterRemove<
  T extends { _id: string; deletedAt?: number },
>(rows: readonly T[], removedId: T["_id"]): T[] {
  return visibleDrafts(rows).filter((row) => row._id !== removedId);
}

/**
 * The badge count to paint while `remove` is in flight.
 *
 * Clamped at zero: the count and the list are separate subscriptions, so a
 * stale count of 0 plus a removal must not render "-1 drafts".
 */
export function draftCountAfterRemove(count: number): number {
  return Math.max(0, count - 1);
}
