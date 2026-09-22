/**
 * Applies a saved manual tab order to the sessions currently in a group.
 *
 * Ids the user has dragged keep the position they were dropped in; everything
 * else follows in the order the caller passed (creation order, so a finishing
 * agent cannot move a tab out from under the pointer). Saved ids that no longer
 * exist are ignored rather than leaving a hole, and a session that is missing
 * from the saved order is appended rather than dropped — which is what makes a
 * stale order safe to keep in localStorage indefinitely.
 */
export function mergeSessionTabOrder<T extends { _id: string }>(
  sessions: T[],
  order: readonly string[],
): T[] {
  if (order.length === 0) return sessions;
  const byId = new Map(sessions.map((session) => [session._id, session]));
  const ordered: T[] = [];
  const placed = new Set<string>();
  for (const id of order) {
    const session = byId.get(id);
    if (session === undefined || placed.has(id)) continue;
    ordered.push(session);
    placed.add(id);
  }
  for (const session of sessions) {
    if (placed.has(session._id)) continue;
    ordered.push(session);
  }
  return ordered;
}
