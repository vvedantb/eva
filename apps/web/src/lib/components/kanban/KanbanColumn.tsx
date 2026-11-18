"use client";

import { cn } from "@eva/ui";
import { Badge, KanbanBoard } from "@vvedantb/ui";
import { useCallback, type ReactNode, type RefCallback } from "react";

import type { IconCircle } from "@tabler/icons-react";
import { TASK_STATUSES } from "@/lib/components/tasks/TaskStatusBadge";

export { TASK_STATUSES as KANBAN_STATUSES };

/**
 * Width sizing for a kanban column wrapper. Each breakpoint fixes how many
 * columns fit on screen — 1 on mobile (with a peek of the next one to signal
 * the scroll), 2 on tablet, 3 on small desktops, 4 on large ones, 5 on the
 * widest. The basis subtracts the `gap-3` gutters between those columns, so an
 * n-column step subtracts (n-1) × 0.75rem. Columns never shrink, so
 * extra statuses push the board into a horizontal scroll rather than squishing
 * every column; boards with fewer columns than the breakpoint allows still grow
 * to fill the width.
 */
export const KANBAN_COLUMN_WIDTH_CLASS =
  "min-w-[70vw] flex-1 sm:min-w-0 sm:flex-[1_0_calc((100%-0.75rem)/2)] lg:flex-[1_0_calc((100%-1.5rem)/3)] xl:flex-[1_0_calc((100%-2.25rem)/4)] 2xl:flex-[1_0_calc((100%-3rem)/5)]";

interface ColumnConfig {
  bg: string;
  /** Kept for callers; columns use a flat muted wash. */
  cardBg?: string;
  text: string;
  label: string;
  icon: typeof IconCircle;
}

interface KanbanColumnProps {
  id: string;
  config: ColumnConfig;
  count: number;
  children: ReactNode;
  droppable?: boolean;
  headerExtra?: ReactNode;
  emptyLabel?: string;
  scrollRef?: RefCallback<HTMLDivElement>;
  className?: string;
}

export function KanbanColumn({
  id,
  config,
  count,
  children,
  droppable = true,
  headerExtra,
  emptyLabel = "No items",
  scrollRef,
  className,
}: KanbanColumnProps) {
  const Icon = config.icon;

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef?.(node);
    },
    [scrollRef],
  );

  return (
    <KanbanBoard
      id={id}
      disabled={!droppable}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 self-stretch flex-col overflow-clip bg-muted/40",
        className,
      )}
    >
      <div className="flex shrink-0 flex-row items-center justify-between p-2">
        <Badge
          variant="outline"
          className={`${config.bg} ${config.text} gap-1.5 py-1`}
        >
          <Icon size={14} className={config.text} />
          {config.label}
          <span className="tabular-nums text-foreground/50">{count}</span>
        </Badge>
        {headerExtra}
      </div>
      <div
        ref={ref}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain p-1.5 pt-0 scrollbar scroll-fade md:p-1.5 md:pt-0"
      >
        {count === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground/50">
            {emptyLabel}
          </div>
        ) : null}
        {children}
      </div>
    </KanbanBoard>
  );
}
