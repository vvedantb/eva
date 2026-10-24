"use client";

import dayjs from "../utils/dayjs";
import type { FC, ReactNode } from "react";
import { useId, useMemo } from "react";
import { cn } from "../utils/cn";
import {
  useGanttContext,
  getDifferenceIn,
  calculateInnerOffset,
} from "./gantt-provider";

export type GanttTimelineProps = {
  children: ReactNode;
  className?: string;
};

export const GanttTimeline: FC<GanttTimelineProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      "relative flex h-full w-max flex-none overflow-clip",
      className,
    )}
  >
    {children}
  </div>
);

export type GanttColumnsProps = {
  columns: number;
  isColumnSecondary?: (item: number) => boolean;
  isColumnDivider?: (item: number) => boolean;
};

export const GanttColumns: FC<GanttColumnsProps> = ({
  columns,
  isColumnSecondary,
  isColumnDivider,
}) => {
  const id = useId();

  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
      }}
    >
      {Array.from({ length: columns }).map((_, index) => (
        <GanttColumn
          index={index}
          isColumnSecondary={isColumnSecondary}
          isColumnDivider={isColumnDivider}
          key={`${id}-${index}`}
        />
      ))}
    </div>
  );
};

export type GanttColumnProps = {
  index: number;
  isColumnSecondary?: (item: number) => boolean;
  isColumnDivider?: (item: number) => boolean;
};

export const GanttColumn: FC<GanttColumnProps> = ({
  index,
  isColumnSecondary,
  isColumnDivider,
}) => (
  <div
    className={cn(
      "group relative h-full overflow-hidden",
      isColumnDivider
        ? isColumnDivider(index)
          ? "border-l border-border/50"
          : ""
        : "border-r border-border/40",
      isColumnSecondary?.(index) ? "bg-muted/30" : "",
    )}
  />
);

export type GanttTodayProps = {
  className?: string;
};

export const GanttToday: FC<GanttTodayProps> = ({ className }) => {
  const gantt = useGanttContext();
  const date = useMemo(() => new Date(), []);

  const differenceIn = useMemo(
    () => getDifferenceIn(gantt.range),
    [gantt.range],
  );
  const timelineStartDate = useMemo(() => {
    const firstYear = gantt.timelineData[0]?.year ?? new Date().getFullYear();
    return new Date(firstYear, 0, 1);
  }, [gantt.timelineData]);

  const offset = useMemo(
    () => differenceIn(date, timelineStartDate),
    [differenceIn, date, timelineStartDate],
  );
  const innerOffset = useMemo(
    () =>
      calculateInnerOffset(
        date,
        gantt.range,
        (gantt.columnWidth * gantt.zoom) / 100,
      ),
    [date, gantt.range, gantt.columnWidth, gantt.zoom],
  );

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-full select-none flex-col items-center justify-center overflow-visible"
      style={{
        width: 0,
        transform: `translateX(calc(var(--gantt-column-width) * ${offset} + ${innerOffset}px))`,
      }}
    >
      <div
        className={cn(
          "group pointer-events-auto sticky top-0 z-1 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-primary px-2 py-0.5 text-3xs font-medium text-primary-foreground",
          className,
        )}
      >
        Today
        {/* Only max-height, not `all`: the pill inherits colour from its
            parent, so `transition-all` also dragged those along. The height
            animation relayouts nothing outside the marker, which is absolutely
            positioned at zero width. */}
        <span className="max-h-0 overflow-hidden opacity-90 transition-[max-height] duration-[var(--motion-base)] group-hover:max-h-8">
          {dayjs(date).format("MMM DD, YYYY")}
        </span>
      </div>
      <div className={cn("h-full w-px bg-primary/70", className)} />
    </div>
  );
};
