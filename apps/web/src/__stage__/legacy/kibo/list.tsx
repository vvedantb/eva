"use client";

import {
  DndContext,
  type DragEndEvent,
  rectIntersection,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import { useDragSensors } from "../utils/useDragSensors";

export type { DragEndEvent as ListDragEndEvent } from "@dnd-kit/core";

export type ListItemsProps = {
  children: ReactNode;
  className?: string;
};

export const ListItems = ({ children, className }: ListItemsProps) => (
  <div className={cn("flex flex-1 flex-col gap-0.5", className)}>
    {children}
  </div>
);

export type ListHeaderProps =
  | {
      children: ReactNode;
    }
  | {
      name: string;
      color: string;
      className?: string;
    };

export const ListHeader = (props: ListHeaderProps) =>
  "children" in props ? (
    props.children
  ) : (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 bg-foreground/5 p-3",
        props.className,
      )}
    >
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: props.color }}
      />
      <p className="m-0 font-semibold text-sm">{props.name}</p>
    </div>
  );

export type ListGroupProps = {
  id: string;
  children: ReactNode;
  className?: string;
};

export const ListGroup = ({ id, children, className }: ListGroupProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={cn("transition-colors", isOver && "bg-muted/40", className)}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
};

export type ListItemProps = {
  readonly id: string;
  readonly name: string;
  readonly index: number;
  readonly parent: string;
  readonly children?: ReactNode;
  readonly className?: string;
};

export const ListItem = ({
  id,
  name,
  index,
  parent,
  children,
  className,
}: ListItemProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { index, parent },
    });

  return (
    <div
      className={cn(
        "cursor-grab",
        isDragging && "cursor-grabbing opacity-50",
        className,
      )}
      style={{
        transform: transform
          ? `translateX(${transform.x}px) translateY(${transform.y}px)`
          : "none",
      }}
      {...listeners}
      {...attributes}
      ref={setNodeRef}
    >
      {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
    </div>
  );
};

export type ListProviderProps = {
  children: ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  className?: string;
};

export const ListProvider = ({
  children,
  onDragEnd,
  className,
}: ListProviderProps) => {
  // A lone `PointerSensor` armed on distance meant the list could not be
  // reordered by touch at all: the whole row is the drag handle, the drag is
  // restricted to the vertical axis, and that is the same axis the finger
  // scrolls on — so the browser claimed the gesture and cancelled the pointer
  // every time.
  const sensors = useDragSensors();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <div className={cn("flex size-full flex-col", className)}>{children}</div>
    </DndContext>
  );
};
