"use client";

import type {
  Announcements,
  CollisionDetection,
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";
import { useDragSensors } from "../utils/useDragSensors";
import { resolveOverColumnId } from "./kanbanDropTarget";

export type KanbanItem = {
  id: string;
  name: string;
  column: string;
};

export type KanbanColumnDef = {
  id: string;
  name: string;
};

type KanbanContextValue = {
  columns: KanbanColumnDef[];
  data: KanbanItem[];
  activeCardId: string | null;
  /**
   * Column the dragged card would land in. Distinct from a column's own
   * `isOver`: pointing at a card resolves `over` to that card, so the column
   * under the pointer never reports `isOver` once it holds any cards.
   */
  overColumnId: string | null;
};

const KanbanContext = createContext<KanbanContextValue>({
  columns: [],
  data: [],
  activeCardId: null,
  overColumnId: null,
});

export const useKanbanContext = () => useContext(KanbanContext);

// --- KanbanBoard: droppable column zone ---

export type KanbanBoardProps = {
  id: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

export const KanbanBoard = ({
  id,
  children,
  className,
  disabled = false,
}: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });
  const { overColumnId } = useKanbanContext();
  const isDropTarget = !disabled && (isOver || overColumnId === id);

  return (
    <div
      className={cn(
        "flex size-full min-h-40 flex-col overflow-hidden bg-muted/40 text-xs transition-[background-color,border-color]",
        SURFACE_RADIUS_CLASS,
        className,
        // After `className` on purpose: callers set a column background, and
        // tailwind-merge keeps whichever `bg-*` / `border-*` comes last — so
        // the drop highlight has to be the last word or it never shows.
        isDropTarget && "border border-primary/40 bg-primary/10",
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
};

// --- KanbanCard: sortable item wrapper ---

export type KanbanCardProps = {
  id: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
};

export const KanbanCard = ({
  id,
  children,
  className,
  onClick,
}: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transition,
    transform,
    isDragging,
  } = useSortable({ id });

  const style = {
    /**
     * `useSortable` hands back a `transition` string, and putting it in inline
     * style outranks every `transition-*` class on the element — the shorthand
     * resets `transition-property`, so while a sort is animating the class below
     * is not merely overridden on duration, it stops applying at all and the
     * press scale snaps. dnd-kit's own entry only ever names `transform`.
     *
     * Appending the two properties the card animates itself keeps the reflow
     * tween dnd-kit wants and the press and drag-fade the card wants. The value
     * is `undefined` when nothing is sorting, which is why it is filtered rather
     * than interpolated.
     */
    transition: [
      transition,
      "scale var(--motion-fast) var(--motion-ease-out)",
      "opacity var(--motion-fast) var(--motion-ease-out)",
    ]
      .filter(Boolean)
      .join(", "),
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      style={style}
      {...listeners}
      {...attributes}
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        // Press feedback on pointer-down, not on release — the card has to
        // acknowledge the grab before the drag threshold is crossed, or the
        // first few pixels of every drag read as a dead control.
        //
        // `scale` is named explicitly alongside `transform`: an arbitrary
        // `transition-[…]` emits exactly the properties listed, and Tailwind
        // compiles `scale-[0.98]` to the individual `scale` property, which
        // `transform` does not match — so this press was a no-op. `transform`
        // stays for the inline one `useSortable` writes below.
        "cursor-grab transition-[opacity,transform,scale] duration-[var(--motion-fast)] active:scale-[0.98]",
        SURFACE_RADIUS_CLASS,
        isDragging && "pointer-events-none cursor-grabbing opacity-30",
        className,
      )}
    >
      {children}
    </div>
  );
};

// --- KanbanCards: SortableContext + auto-filter by column from context ---

export type KanbanCardsProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "id"
> & {
  children: (item: KanbanItem) => ReactNode;
  id: string;
};

export const KanbanCards = ({
  children,
  className,
  id,
  ...props
}: KanbanCardsProps) => {
  const { data } = useKanbanContext();
  const filteredData = data.filter((item) => item.column === id);
  const itemIds = filteredData.map((item) => item.id);

  return (
    <SortableContext items={itemIds}>
      <div className={cn("flex grow flex-col gap-1.5", className)} {...props}>
        {filteredData.map(children)}
      </div>
    </SortableContext>
  );
};

// --- KanbanHeader: simple styled header ---

export type KanbanHeaderProps = HTMLAttributes<HTMLDivElement>;

export const KanbanHeader = ({ className, ...props }: KanbanHeaderProps) => (
  <div className={cn("m-0 p-2 font-semibold text-sm", className)} {...props} />
);

// --- KanbanProvider: DnD context + Kanban context + a11y ---

export type KanbanProviderProps = {
  children: ReactNode;
  columns: KanbanColumnDef[];
  data: KanbanItem[];
  overlay?: ReactNode;
  className?: string;
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
  collisionDetection?: CollisionDetection;
};

export const KanbanProvider = ({
  children,
  columns,
  data,
  overlay,
  className,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragCancel,
  collisionDetection = closestCenter,
}: KanbanProviderProps) => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const sensors = useDragSensors({ sortable: true });

  const handleDragStart = (event: DragStartEvent) => {
    const card = data.find((item) => item.id === event.active.id);
    if (card) {
      setActiveCardId(String(event.active.id));
    }
    onDragStart?.(event);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    setOverColumnId(resolveOverColumnId(overId, columns, data));
    onDragOver?.(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCardId(null);
    setOverColumnId(null);
    onDragEnd?.(event);
  };

  const handleDragCancel = (event: DragCancelEvent) => {
    setActiveCardId(null);
    setOverColumnId(null);
    onDragCancel?.(event);
  };

  const announcements: Announcements = {
    onDragStart({ active }) {
      const item = data.find((d) => d.id === active.id);
      const col = columns.find((c) => c.id === item?.column);
      return `Picked up card "${item?.name}" from "${col?.name}" column`;
    },
    onDragOver({ active, over }) {
      const item = data.find((d) => d.id === active.id);
      const col = columns.find((c) => c.id === over?.id);
      return `Dragged card "${item?.name}" over "${col?.name}" column`;
    },
    onDragEnd({ active, over }) {
      const item = data.find((d) => d.id === active.id);
      const col = columns.find((c) => c.id === over?.id);
      return `Dropped card "${item?.name}" into "${col?.name}" column`;
    },
    onDragCancel({ active }) {
      const item = data.find((d) => d.id === active.id);
      return `Cancelled dragging card "${item?.name}"`;
    },
  };

  return (
    <KanbanContext.Provider
      value={{ columns, data, activeCardId, overColumnId }}
    >
      <DndContext
        accessibility={{ announcements }}
        collisionDetection={collisionDetection}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        sensors={sensors}
      >
        {className ? <div className={className}>{children}</div> : children}
        {typeof window !== "undefined" &&
          createPortal(<DragOverlay>{overlay}</DragOverlay>, document.body)}
      </DndContext>
    </KanbanContext.Provider>
  );
};
