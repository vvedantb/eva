import { useState } from "react";
import { rangeBetween, type SelectionToggleOptions } from "./selectionRange";

export interface ListSelection<T extends string> {
  isSelecting: boolean;
  selectedIds: Set<T>;
  toggle: (id: T, options?: SelectionToggleOptions<T>) => void;
  selectAll: (ids: ReadonlyArray<T>) => void;
  clear: () => void;
  enter: () => void;
  exit: () => void;
}

/**
 * Bulk-select state of a list (quick tasks, projects): select mode, the
 * selected ids, and the anchor a shift-click measures from.
 *
 * `existingIds` is every row the list holds before filtering, so a filter
 * change never drops a selection. Ids that leave it (archived elsewhere,
 * moved out of the repo) are pruned during render.
 */
export function useListSelection<T extends string>(
  existingIds: ReadonlyArray<T>,
): ListSelection<T> {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());
  // Where the next shift-click measures from: the last row toggled on its own.
  const [anchorId, setAnchorId] = useState<T | null>(null);

  // Drop selections for rows that disappeared (adjust during render).
  if (isSelecting) {
    const existing = new Set<string>(existingIds);
    if ([...selectedIds].some((id) => !existing.has(id))) {
      setSelectedIds(new Set([...selectedIds].filter((id) => existing.has(id))));
    }
  }

  const toggle = (id: T, options?: SelectionToggleOptions<T>) => {
    // A range only ever adds: shift-clicking back over a span you just selected
    // should not punch holes in it.
    if (options?.range) {
      const range = rangeBetween(options.orderedIds ?? [], anchorId, id);
      setSelectedIds((prev) => new Set([...prev, ...range]));
      return;
    }
    setAnchorId(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clear = () => {
    setSelectedIds(new Set());
    setAnchorId(null);
  };

  return {
    isSelecting,
    selectedIds,
    toggle,
    selectAll: (ids) => setSelectedIds(new Set(ids)),
    clear,
    enter: () => setIsSelecting(true),
    exit: () => {
      setIsSelecting(false);
      clear();
    },
  };
}
