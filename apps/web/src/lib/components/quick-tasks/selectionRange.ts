/**
 * How a row asked to be selected. `range` is the shift modifier; `orderedIds`
 * is the clicked view's own visible order (the list group, the kanban column),
 * which is the only thing that knows what "between" means on screen.
 */
export interface SelectionToggleOptions<T> {
  range?: boolean;
  orderedIds?: ReadonlyArray<T>;
}

/**
 * Shift-click range selection, in the order the clicked view renders.
 *
 * Every list that supports bulk selection (quick tasks, projects) passes the ids
 * of the group or column the click landed in, so a range never jumps across a
 * collapsed section or a neighbouring kanban column. With no anchor — the first
 * click of a selection, or an anchor that has since been filtered away — there
 * is nothing to span, so only the clicked row is returned.
 */
export function rangeBetween<T>(
  orderedIds: ReadonlyArray<T>,
  anchorId: T | null,
  targetId: T,
): T[] {
  if (anchorId === null) return [targetId];
  const anchorIndex = orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) return [targetId];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return orderedIds.slice(start, end + 1);
}
