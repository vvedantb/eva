"use client";

import { cn } from "@eva/ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SessionChromeTab,
  type SessionChromeTabProps,
} from "@/lib/components/sidebar/session-tabs/SessionChromeTab";

/**
 * Drag-to-reorder wrapper around one Chrome tab.
 *
 * The listeners sit on the whole tab rather than a handle, as in Chrome. That
 * is only safe because the house sensors arm on **distance**: a click reaches
 * the link underneath, and only a pointer that travels 8px picks the tab up.
 */
export function SortableSessionTab(props: SessionChromeTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.session._id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // `touch-none` is what lets the touch sensor's hold-to-arm win over the
        // browser's own gesture handling; the strip never scrolls anyway.
        "flex min-w-0 flex-1 touch-none",
        isDragging && "z-20 opacity-70",
      )}
      {...listeners}
      {...attributes}
    >
      <SessionChromeTab {...props} />
    </div>
  );
}
