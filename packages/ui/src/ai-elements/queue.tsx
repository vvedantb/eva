"use client";

import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { Button } from "../ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { cn } from "../utils/cn";

export type QueueProps = ComponentProps<"div">;

/** Root container for a collapsible queue of pending items (Cursor-style). */
export const Queue = ({ className, ...props }: QueueProps) => (
  <div
    className={cn(
      "flex flex-col rounded-xl border border-border bg-card/40 px-2.5 py-2",
      className,
    )}
    {...props}
  />
);

export type QueueSectionProps = ComponentProps<typeof Collapsible>;

export const QueueSection = ({
  className,
  defaultOpen = true,
  ...props
}: QueueSectionProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type QueueSectionTriggerProps = ComponentProps<"button">;

export const QueueSectionTrigger = ({
  children,
  className,
  ...props
}: QueueSectionTriggerProps) => (
  <CollapsibleTrigger asChild>
    <button
      className={cn(
        // `QueueItemAction` below delegates to `Button` and presses; this
        // section header was the one control in the file that did not.
        "group motion-press flex w-full items-center rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.99]",
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  </CollapsibleTrigger>
);

export type QueueSectionLabelProps = ComponentProps<"span"> & {
  count?: number;
  label: string;
  icon?: ReactNode;
};

export const QueueSectionLabel = ({
  count,
  label,
  icon,
  className,
  ...props
}: QueueSectionLabelProps) => (
  <span className={cn("flex items-center gap-1.5", className)} {...props}>
    {icon}
    <span>
      {count} {label}
    </span>
    {/* Same chevron as the activity timeline's Trace lines: after the text,
        pointing right, turning 90° when the section is open. */}
    <IconChevronRight className="-ml-0.5 size-3.5 opacity-70 transition-transform group-data-[state=open]:rotate-90" />
  </span>
);

export type QueueSectionContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const QueueSectionContent = ({
  className,
  ...props
}: QueueSectionContentProps) => (
  <CollapsibleContent className={cn(className)} {...props} />
);

export type QueueListProps = ComponentProps<"div">;

/** Scrollable list wrapper (max-height capped like upstream AI Elements Queue). */
export const QueueList = ({
  children,
  className,
  ...props
}: QueueListProps) => (
  <div className={cn("mt-1", className)} {...props}>
    <div className="max-h-48 overflow-y-auto">
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  </div>
);

export type QueueItemProps = ComponentProps<"li">;

export const QueueItem = forwardRef<HTMLLIElement, QueueItemProps>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      className={cn(
        "group flex flex-col gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  ),
);
QueueItem.displayName = "QueueItem";

export type QueueItemIndicatorProps = ComponentProps<"span"> & {
  completed?: boolean;
};

export const QueueItemIndicator = ({
  completed = false,
  className,
  ...props
}: QueueItemIndicatorProps) => (
  <span
    className={cn(
      "mt-1 inline-block size-2.5 shrink-0 rounded-full border",
      completed
        ? "border-muted-foreground/20 bg-muted-foreground/10"
        : "border-muted-foreground/45",
      className,
    )}
    {...props}
  />
);

export type QueueItemContentProps = ComponentProps<"span"> & {
  completed?: boolean;
};

export const QueueItemContent = ({
  completed = false,
  className,
  ...props
}: QueueItemContentProps) => (
  <span
    className={cn(
      "line-clamp-2 min-w-0 grow wrap-break-word leading-snug",
      completed
        ? "text-muted-foreground/50 line-through"
        : "text-foreground/90",
      className,
    )}
    {...props}
  />
);

export type QueueItemActionsProps = ComponentProps<"div">;

export const QueueItemActions = ({
  className,
  ...props
}: QueueItemActionsProps) => (
  <div
    className={cn(
      // `reveal-on-hover` rather than a bare `opacity-0 group-hover:*`: touch has
      // no hover, so the hand-rolled version left edit/move/delete on a queued
      // message permanently invisible — and still clickable, so the row carried a
      // dead tap zone. The utility ships them visible below `sm`.
      "flex shrink-0 items-start gap-0.5 reveal-on-hover transition-opacity",
      className,
    )}
    {...props}
  />
);

export type QueueItemActionProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size"
>;

export const QueueItemAction = ({
  className,
  ...props
}: QueueItemActionProps) => (
  <Button
    className={cn(
      "size-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
      className,
    )}
    size="icon"
    type="button"
    variant="ghost"
    {...props}
  />
);
