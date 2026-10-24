"use client";

import dayjs from "../utils/dayjs";
import type { FC, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../utils/cn";
import { useGanttContext, type Range } from "./gantt-provider";
import { GanttColumns } from "./gantt-timeline";

export type GanttContentHeaderProps = {
  renderHeaderItem: (index: number) => ReactNode;
  title: string;
  columns: number;
  /** Marks the column matching "now" so it can be visually emphasised. */
  isColumnCurrent?: (index: number) => boolean;
  /** When provided, only flagged columns get a left divider (e.g. week starts);
   *  otherwise every column gets a right divider. */
  isColumnDivider?: (index: number) => boolean;
};

export const GanttContentHeader: FC<GanttContentHeaderProps> = ({
  title,
  columns,
  renderHeaderItem,
  isColumnCurrent,
  isColumnDivider,
}) => {
  const id = useId();

  return (
    <div
      className="sticky top-0 z-20 grid w-full shrink-0 border-b border-border bg-background/95 backdrop-blur-xs"
      style={{ height: "var(--gantt-header-height)" }}
    >
      <div>
        <div
          className="sticky inline-flex whitespace-nowrap px-3 py-2 font-medium text-foreground/70 text-xs"
          style={{ left: "var(--gantt-sidebar-width)" }}
        >
          <p>{title}</p>
        </div>
      </div>
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
        }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div
            className={cn(
              "shrink-0 py-1 text-center text-xs text-muted-foreground",
              isColumnDivider
                ? isColumnDivider(index)
                  ? "border-l border-border/60"
                  : ""
                : "border-r border-border/50",
              isColumnCurrent?.(index) &&
                "bg-primary/5 font-medium text-foreground",
            )}
            key={`${id}-${index}`}
          >
            {renderHeaderItem(index)}
          </div>
        ))}
      </div>
    </div>
  );
};

const DailyHeader: FC = () => {
  const gantt = useGanttContext();
  const now = dayjs();

  return gantt.timelineData.map((year) =>
    year.quarters
      .flatMap((quarter) => quarter.months)
      .map((month, index) => {
        const monthStart = new Date(year.year, index, 1);
        // Linear's grid is weekly: label + divide only at week starts (Sundays).
        const isWeekStart = (item: number) =>
          dayjs(monthStart).add(item, "day").day() === 0;
        return (
          <div className="relative flex flex-col" key={`${year.year}-${index}`}>
            <GanttContentHeader
              columns={month.days}
              isColumnDivider={isWeekStart}
              isColumnCurrent={(item) =>
                now.year() === year.year &&
                now.month() === index &&
                now.date() === item + 1
              }
              renderHeaderItem={(item: number) =>
                isWeekStart(item) ? (
                  <span>{dayjs(monthStart).add(item, "day").format("D")}</span>
                ) : null
              }
              title={dayjs(monthStart).format("MMMM YYYY")}
            />
            <GanttColumns columns={month.days} isColumnDivider={isWeekStart} />
          </div>
        );
      }),
  );
};

const MonthlyHeader: FC = () => {
  const gantt = useGanttContext();
  const now = dayjs();

  return gantt.timelineData.map((year) => (
    <div className="relative flex flex-col" key={year.year}>
      <GanttContentHeader
        columns={year.quarters.flatMap((quarter) => quarter.months).length}
        isColumnCurrent={(item) =>
          now.year() === year.year && now.month() === item
        }
        renderHeaderItem={(item: number) => (
          <p>{dayjs(new Date(year.year, item, 1)).format("MMM")}</p>
        )}
        title={`${year.year}`}
      />
      <GanttColumns
        columns={year.quarters.flatMap((quarter) => quarter.months).length}
      />
    </div>
  ));
};

const QuarterlyHeader: FC = () => {
  const gantt = useGanttContext();
  const now = dayjs();

  return gantt.timelineData.map((year) =>
    year.quarters.map((quarter, quarterIndex) => (
      <div
        className="relative flex flex-col"
        key={`${year.year}-${quarterIndex}`}
      >
        <GanttContentHeader
          columns={quarter.months.length}
          isColumnCurrent={(item) =>
            now.year() === year.year && now.month() === quarterIndex * 3 + item
          }
          renderHeaderItem={(item: number) => (
            <p>
              {dayjs(new Date(year.year, quarterIndex * 3 + item, 1)).format(
                "MMM",
              )}
            </p>
          )}
          title={`Q${quarterIndex + 1} ${year.year}`}
        />
        <GanttColumns columns={quarter.months.length} />
      </div>
    )),
  );
};

const headers: Record<Range, FC> = {
  daily: DailyHeader,
  monthly: MonthlyHeader,
  quarterly: QuarterlyHeader,
};

export type GanttHeaderProps = {
  className?: string;
};

export const GanttHeader: FC<GanttHeaderProps> = ({ className }) => {
  const gantt = useGanttContext();
  const Header = headers[gantt.range];

  return (
    <div className={cn("-space-x-px flex h-full w-max", className)}>
      <Header />
    </div>
  );
};
