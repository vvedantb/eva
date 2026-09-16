"use client";

import { useState } from "react";

/**
 * The ids from `anchorId` to `targetId` inclusive, in rendered order — what a
 * shift-click selects. Either id being absent (the row scrolled out of the
 * filtered list between clicks) falls back to the target alone, so a stale
 * anchor can never select a range the user cannot see.
 */
export function rangeBetween(
  orderedIds: readonly string[],
  anchorId: string,
  targetId: string,
): string[] {
  const anchorAt = orderedIds.indexOf(anchorId);
  const targetAt = orderedIds.indexOf(targetId);
  if (anchorAt === -1 || targetAt === -1) return [targetId];
  const start = Math.min(anchorAt, targetAt);
  const end = Math.max(anchorAt, targetAt);
  return [...orderedIds.slice(start, end + 1)];
}

export interface InboxSelection {
  isSelecting: boolean;
  selectedIds: ReadonlySet<string>;
  /** Last plain-toggled row; the other end of a shift-click range. */
  anchorId: string | null;
  /** Enters selection mode (the header's Select button). */
  start: () => void;
  /** Toggles one row, or extends from the anchor when shift is held. */
  toggle: (id: string, extend?: boolean) => void;
  selectAll: () => void;
  clear: () => void;
  /** Leaves selection mode and drops the selection. */
  exit: () => void;
}

/**
 * Multi-select for the inbox list. `orderedIds` is the flat, rendered order of
 * the currently filtered list: it defines what "select all" and a shift-click
 * range mean, and selections for rows that leave that list are pruned during
 * render so a bulk action can never reach a row the user stopped seeing.
 */
export function useInboxSelection(
  orderedIds: readonly string[],
): InboxSelection {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const visible = new Set(orderedIds);
  if (selectedIds.size > 0) {
    let stale = false;
    for (const id of selectedIds) {
      if (!visible.has(id)) {
        stale = true;
        break;
      }
    }
    if (stale) {
      const pruned = new Set<string>();
      for (const id of selectedIds) {
        if (visible.has(id)) pruned.add(id);
      }
      setSelectedIds(pruned);
    }
  }

  const clear = () => {
    setSelectedIds(new Set());
    setAnchorId(null);
  };

  return {
    isSelecting,
    selectedIds,
    anchorId,
    start: () => setIsSelecting(true),
    toggle: (id, extend = false) => {
      const next = new Set(selectedIds);
      if (extend && anchorId !== null) {
        for (const inRange of rangeBetween(orderedIds, anchorId, id)) {
          next.add(inRange);
        }
        setSelectedIds(next);
        return;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
      setAnchorId(id);
    },
    selectAll: () => setSelectedIds(new Set(orderedIds)),
    clear,
    exit: () => {
      setIsSelecting(false);
      clear();
    },
  };
}
