import type { KanbanColumnDef, KanbanItem } from "./kanban";

/**
 * The column a dragged card would land in, given whatever dnd-kit reports as
 * `over`.
 *
 * `over` is the column only while the pointer is on that column's empty space —
 * once it is on a card, `over` is the card. A column that relies on its own
 * `isOver` therefore stops highlighting the moment it holds anything, which is
 * every column that matters. Resolving the card back to its column is what makes
 * the drop target visible during a real drag.
 */
export function resolveOverColumnId(
  overId: string | null,
  columns: KanbanColumnDef[],
  data: KanbanItem[],
): string | null {
  if (overId === null) {
    return null;
  }
  if (columns.some((column) => column.id === overId)) {
    return overId;
  }
  return data.find((item) => item.id === overId)?.column ?? null;
}
