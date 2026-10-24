"use client";

import dayjs from "../utils/dayjs";
import type { FC, ReactNode } from "react";
import { cn } from "../utils/cn";
import { CONTROL_RADIUS_CLASS } from "../utils/surface-radius";
import { useGanttContext, type GanttFeature } from "./gantt-provider";

export type GanttSidebarItemProps = {
  feature: GanttFeature;
  onSelectItem?: (id: string) => void;
  /** Leading slot (e.g. a phase status icon). Falls back to a colour dot. */
  icon?: ReactNode;
  /** Trailing slot (e.g. avatars + progress). Falls back to the duration. */
  meta?: ReactNode;
  selected?: boolean;
  className?: string;
};

export const GanttSidebarItem: FC<GanttSidebarItemProps> = ({
  feature,
  onSelectItem,
  icon,
  meta,
  selected,
  className,
}) => {
  const gantt = useGanttContext();
  const tempEndAt =
    feature.endAt && dayjs(feature.startAt).isSame(dayjs(feature.endAt), "day")
      ? dayjs(feature.endAt).add(1, "day").toDate()
      : feature.endAt;
  const duration = tempEndAt
    ? dayjs(feature.startAt).from(dayjs(tempEndAt), true)
    : `${dayjs(feature.startAt).from(dayjs(), true)} so far`;

  const select = () => {
    gantt.scrollToFeature?.(feature);
    onSelectItem?.(feature.id);
  };

  return (
    // A plain row with a real `<button>` stretched across it, not a
    // `role="button" tabIndex={0}` div — see `ui/list-row.tsx`, which documents
    // why the div form needs a hand-written Enter/Space handler and still gets
    // the role, focus and press semantics wrong. The row keeps its own `relative`
    // so the overlay is bounded by it.
    <div
      className={cn(
        "relative flex cursor-pointer items-center gap-2.5 px-2.5 text-xs transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring/35",
        CONTROL_RADIUS_CLASS,
        selected && "bg-muted/60 ring-1 ring-inset ring-border",
        className,
      )}
      key={feature.id}
      style={{ height: "var(--gantt-row-height)" }}
    >
      <button
        type="button"
        onClick={select}
        aria-label={feature.name}
        className="absolute inset-0 z-1 outline-hidden"
      />
      {icon ? (
        <span className="pointer-events-none flex shrink-0 items-center">
          {icon}
        </span>
      ) : (
        <div
          className="pointer-events-none h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: feature.status.color }}
        />
      )}
      <p className="pointer-events-none flex-1 truncate text-left font-medium">
        {feature.name}
      </p>
      {meta ? (
        <div className="pointer-events-none flex shrink-0 items-center">
          {meta}
        </div>
      ) : (
        <p className="pointer-events-none text-muted-foreground tabular-nums">
          {duration}
        </p>
      )}
    </div>
  );
};

type GanttSidebarHeaderProps = {
  title?: string;
  metaLabel?: string;
};

export const GanttSidebarHeader: FC<GanttSidebarHeaderProps> = ({
  title = "Issues",
  metaLabel = "Duration",
}) => (
  <div
    className="sticky top-0 z-10 flex shrink-0 items-end justify-between gap-2.5 border-b border-border bg-background/95 p-2.5 font-medium text-muted-foreground text-xs backdrop-blur-xs"
    style={{ height: "var(--gantt-header-height)" }}
  >
    <p className="flex-1 truncate text-left">{title}</p>
    <p className="shrink-0">{metaLabel}</p>
  </div>
);

export type GanttSidebarGroupProps = {
  children: ReactNode;
  name: string;
  className?: string;
};

export const GanttSidebarGroup: FC<GanttSidebarGroupProps> = ({
  children,
  name,
  className,
}) => (
  <div className={className}>
    <p
      className="w-full truncate p-2.5 text-left font-medium text-muted-foreground text-xs"
      style={{ height: "var(--gantt-row-height)" }}
    >
      {name}
    </p>
    <div>{children}</div>
  </div>
);

export type GanttSidebarProps = {
  children: ReactNode;
  className?: string;
  headerTitle?: string;
  headerMeta?: string;
};

export const GanttSidebar: FC<GanttSidebarProps> = ({
  children,
  className,
  headerTitle,
  headerMeta,
}) => (
  <div
    className={cn(
      "sticky left-0 z-30 h-max min-h-full overflow-clip border-r border-border bg-background/95 backdrop-blur-md",
      className,
    )}
    data-roadmap-ui="gantt-sidebar"
  >
    <GanttSidebarHeader title={headerTitle} metaLabel={headerMeta} />
    <div>{children}</div>
  </div>
);
