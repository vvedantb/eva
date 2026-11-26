/**
 * Which quick-task drafts the modal is allowed to show, and what the local
 * store should hold the instant Archive is pressed.
 *
 * `api.agentTasks.archive` stamps `archivedAt` and leaves the row on disk. So
 * "archived" is a predicate the client has to apply, not a fact it can read
 * off the presence of a row — the bug behind fix 613e5d8cc, where a removed
 * draft came straight back on the next subscription push and the button
 * looked dead.
 *
 * Both the render path and the optimistic update go through here so the two
 * cannot drift on what counts as gone.
 */

/** An archived draft is still on disk, so absence is not the test. */
export function visibleDrafts<T extends { archivedAt?: number }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.archivedAt === undefined);
}

/**
 * The list to paint while `archive` is in flight.
 *
 * Drops the row by id — the server has not stamped `archivedAt` yet, so the
 * visibility predicate alone would leave it on screen — and re-applies that
 * predicate, so a row already carrying `archivedAt` cannot ride back in.
 */
export function draftsAfterArchive<
  T extends { _id: string; archivedAt?: number },
>(rows: readonly T[], archivedId: T["_id"]): T[] {
  return visibleDrafts(rows).filter((row) => row._id !== archivedId);
}

/**
 * The badge count to paint while `archive` is in flight.
 *
 * Clamped at zero: the count and the list are separate subscriptions, so a
 * stale count of 0 plus an archive must not render "-1 drafts".
 */
export function draftCountAfterArchive(count: number): number {
  return Math.max(0, count - 1);
}
