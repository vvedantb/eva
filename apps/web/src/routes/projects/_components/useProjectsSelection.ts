import { useState } from "react";
import type { Id } from "@eva/backend";
import {
  rangeBetween,
  type SelectionToggleOptions,
} from "@/lib/components/quick-tasks/selectionRange";

export interface ProjectsSelection {
  isSelecting: boolean;
  selectedIds: Set<Id<"projects">>;
  /** Where the next shift-click measures from. */
  anchorId: Id<"projects"> | null;
  toggle: (
    id: Id<"projects">,
    options?: SelectionToggleOptions<Id<"projects">>,
  ) => void;
  selectAll: (ids: ReadonlyArray<Id<"projects">>) => void;
  clear: () => void;
  enter: () => void;
  exit: () => void;
}

/**
 * Selection state for the projects board, mirroring the quick-tasks surface.
 *
 * `existingIds` is every project currently in the list (before filtering, so a
 * filter change never silently drops a selection); ids that vanish from it —
 * deleted elsewhere, moved out of the repo — are pruned during render.
 */
export function useProjectsSelection(
  existingIds: ReadonlyArray<Id<"projects">>,
): ProjectsSelection {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"projects">>>(
    new Set(),
  );
  const [anchorId, setAnchorId] = useState<Id<"projects"> | null>(null);

  // Drop selections for projects that disappeared (adjust during render).
  if (isSelecting) {
    const existing = new Set<string>(existingIds);
    let needsPrune = false;
    for (const id of selectedIds) {
      if (!existing.has(id)) {
        needsPrune = true;
        break;
      }
    }
    if (needsPrune) {
      const next = new Set<Id<"projects">>();
      for (const id of selectedIds) {
        if (existing.has(id)) next.add(id);
      }
      setSelectedIds(next);
    }
  }

  const toggle = (
    id: Id<"projects">,
    options?: SelectionToggleOptions<Id<"projects">>,
  ) => {
    // A range only ever adds: shift-clicking back over a span you just selected
    // should not punch holes in it.
    if (options?.range) {
      const range = rangeBetween(options.orderedIds ?? [], anchorId, id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const rangeId of range) next.add(rangeId);
        return next;
      });
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
    anchorId,
    toggle,
    selectAll: (ids) => setSelectedIds(new Set(ids)),
    clear,
    enter: () => setIsSelecting(true),
    exit: () => {
      setIsSelecting(false);
      setSelectedIds(new Set());
      setAnchorId(null);
    },
  };
}
