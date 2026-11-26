/**
 * What the local store should hold the instant Delete is pressed on a
 * quick-task draft. `api.agentTasks.deleteDraft` deletes the row; these paint
 * the result before the server answers.
 */

/** The list to paint while `deleteDraft` is in flight. */
export function draftsAfterRemove<T extends { _id: string }>(
  rows: readonly T[],
  removedId: T["_id"],
): T[] {
  return rows.filter((row) => row._id !== removedId);
}

/**
 * The badge count to paint while `deleteDraft` is in flight.
 *
 * Clamped at zero: the count and the list are separate subscriptions, so a
 * stale count of 0 plus a removal must not render "-1 drafts".
 */
export function draftCountAfterRemove(count: number): number {
  return Math.max(0, count - 1);
}

/**
 * A draft's prompt: the one field the new-task forms edit. A draft saved
 * before the forms had one prompt may hold only a title.
 */
export function draftPrompt(draft: {
  title: string;
  description?: string;
}): string {
  return draft.description || draft.title;
}
