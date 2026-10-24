"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  type DragEndEvent,
  type DragStartEvent,
  type DragCancelEvent,
  pointerWithin,
} from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { m, AnimatePresence } from "motion/react";
import { Virtuoso } from "react-virtuoso";
import { cn } from "@eva/ui";
import {
  KanbanCard,
  KanbanProvider,
  tokenTransition,
  toast,
} from "@vvedantb/ui";
import type { KanbanColumnDef, KanbanItem } from "@vvedantb/ui";
import {
  KanbanColumn,
  KANBAN_STATUSES,
  KANBAN_COLUMN_WIDTH_CLASS,
} from "./KanbanColumn";
import {
  statusConfig,
  type TaskStatus,
  type DisplayTaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import { useRepo } from "@/lib/contexts/RepoContext";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";

interface BaseTask {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
}

interface KanbanBoardProps<T extends BaseTask> {
  items: T[];
  visibleStatuses: Set<DisplayTaskStatus>;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  renderCard: (item: T) => ReactNode;
  renderOverlay: (item: T) => ReactNode;
  fillHeight?: boolean;
  columnExtra?: (status: TaskStatus) => ReactNode;
}

const COLUMNS: KanbanColumnDef[] = KANBAN_STATUSES.map((status) => ({
  id: status,
  name: statusConfig[status].label,
}));

export function KanbanBoard<T extends BaseTask>({
  items,
  visibleStatuses,
  onStatusChange,
  renderCard,
  renderOverlay,
  fillHeight = false,
  columnExtra,
}: KanbanBoardProps<T>) {
  const [activeItem, setActiveItem] = useState<T | null>(null);
  const [activeOverlayWidth, setActiveOverlayWidth] = useState<number | null>(
    null,
  );

  const itemsById = new Map(items.map((item) => [item._id, item]));

  const kanbanData: KanbanItem[] = items.map((item) => ({
    id: item._id,
    name: item.title,
    column: item.status,
  }));

  const itemsByStatus = new Map<string, T[]>();
  for (const status of KANBAN_STATUSES) {
    itemsByStatus.set(status, []);
  }
  for (const item of items) {
    itemsByStatus.get(item.status)?.push(item);
  }

  const countByStatus: Record<string, number> = {};
  for (const status of KANBAN_STATUSES) {
    countByStatus[status] = itemsByStatus.get(status)?.length ?? 0;
  }

  const handleDragStart = (event: DragStartEvent) => {
    const item = itemsById.get(String(event.active.id));
    if (item) {
      setActiveItem(item);
      const width =
        event.active.rect.current.initial?.width ??
        event.active.rect.current.translated?.width;
      setActiveOverlayWidth(width ? Math.round(width) : null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveItem(null);
    setActiveOverlayWidth(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeItemData = itemsById.get(activeId);
    if (!activeItemData) return;

    const targetStatus = KANBAN_STATUSES.find((s) => s === overId);
    if (targetStatus) {
      if (activeItemData.status !== targetStatus) {
        try {
          await onStatusChange(activeId, targetStatus);
        } catch (err) {
          console.error("Failed to update status:", err);
          toast.error("Could not move the card. Try again.");
        }
      }
      return;
    }

    const overItemData = itemsById.get(overId);
    if (overItemData && activeItemData.status !== overItemData.status) {
      try {
        await onStatusChange(activeId, overItemData.status);
      } catch (err) {
        console.error("Failed to update status:", err);
        toast.error("Could not move the card. Try again.");
      }
    }
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveItem(null);
    setActiveOverlayWidth(null);
  };

  return (
    <div
      className={
        fillHeight
          ? "flex min-w-0 flex-1 min-h-0 flex-col gap-3 animate-in fade-in duration-300"
          : "space-y-3 animate-in fade-in duration-300"
      }
    >
      <KanbanProvider
        columns={COLUMNS}
        data={kanbanData}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        overlay={
          activeItem ? (
            <div
              className="pointer-events-none rotate-[1.5deg]"
              style={
                activeOverlayWidth
                  ? { width: `${activeOverlayWidth}px` }
                  : undefined
              }
            >
              {renderOverlay(activeItem)}
            </div>
          ) : null
        }
      >
        <div
          className={cn(
            "flex w-full min-w-0 items-stretch gap-2 pb-1 sm:gap-3",
            fillHeight &&
              "h-full min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar scroll-fade-x snap-x snap-mandatory sm:snap-none",
          )}
        >
          <AnimatePresence initial={false}>
            {KANBAN_STATUSES.flatMap((status) =>
              visibleStatuses.has(status)
                ? [
                    <m.div
                      key={status}
                      layout
                      className={`flex min-h-0 self-stretch snap-center ${KANBAN_COLUMN_WIDTH_CLASS}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={tokenTransition.base}
                    >
                      <VirtualKanbanColumn
                        status={status}
                        items={itemsByStatus.get(status) ?? []}
                        count={countByStatus[status] ?? 0}
                        headerExtra={columnExtra?.(status)}
                        renderCard={renderCard}
                      />
                    </m.div>,
                  ]
                : [],
            )}
          </AnimatePresence>
        </div>
      </KanbanProvider>
    </div>
  );
}

function VirtualKanbanColumn<T extends BaseTask>({
  status,
  items,
  count,
  headerExtra,
  renderCard,
}: {
  status: TaskStatus;
  items: T[];
  count: number;
  headerExtra?: ReactNode;
  renderCard: (item: T) => ReactNode;
}) {
  const { owner, name } = useRepo();
  const { scrollParent, scrollRef } = usePersistedScrollParent(
    `${owner}/${name}/quick-tasks/kanban/${status}`,
  );

  const itemIds = useMemo(() => items.map((item) => item._id), [items]);

  return (
    <KanbanColumn
      id={status}
      config={statusConfig[status]}
      count={count}
      headerExtra={headerExtra}
      scrollRef={scrollRef}
    >
      <SortableContext items={itemIds}>
        {scrollParent && (
          <Virtuoso
            customScrollParent={scrollParent}
            totalCount={items.length}
            overscan={200}
            itemContent={(index) => {
              const task = items[index];
              return (
                <div className="pb-1.5">
                  <KanbanCard id={task._id}>{renderCard(task)}</KanbanCard>
                </div>
              );
            }}
          />
        )}
      </SortableContext>
    </KanbanColumn>
  );
}
