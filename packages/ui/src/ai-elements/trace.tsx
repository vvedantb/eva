"use client";

import type { ComponentProps, ReactNode } from "react";
import { IconChevronRight } from "@tabler/icons-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { CrossfadeIconSlot } from "../ui/crossfade-icon";
import { cn } from "../utils/cn";
import { Shimmer } from "./shimmer";

/**
 * One agent step as one line: icon, title, optional faded description, and an
 * optional fold. Reasoning, tool calls, grouped calls, subagents, to-dos and
 * sandbox startup stages all render through these parts.
 *
 * Adapted from shadcn/ui Trace (October 2026). Kept from our side: the
 * compositor `Shimmer` (Trace's CSS shimmer repaints the text every frame), the
 * measured-height `CollapsibleContent`, and `CrossfadeIconSlot` icon swaps.
 */

export type TraceStatus = "running" | "error" | "pending";

export function Trace({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="trace"
      className={cn("flex w-full min-w-0 flex-col gap-2 text-sm", className)}
      {...props}
    />
  );
}

export function TraceLine({
  className,
  status,
  ...props
}: ComponentProps<"span"> & { status?: TraceStatus }) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "flex w-fit max-w-full min-w-0 items-center gap-2 text-muted-foreground text-sm transition-colors",
        "in-[button:hover]:text-foreground",
        "data-[status=error]:text-destructive data-[status=error]:in-[button:hover]:text-destructive",
        "data-[status=pending]:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Pass `iconKey` to crossfade when the glyph or status changes (a spinner
 * turning into a check); leave it out for a static glyph.
 */
export function TraceIcon({
  className,
  iconKey,
  children,
}: {
  className?: string;
  iconKey?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "relative flex size-4 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
    className,
  );
  if (iconKey === undefined) {
    return (
      <span data-slot="trace-icon" aria-hidden="true" className={classes}>
        {children}
      </span>
    );
  }
  return (
    <CrossfadeIconSlot iconKey={iconKey} variant="soft" className={classes}>
      {children}
    </CrossfadeIconSlot>
  );
}

export function TraceTitle({
  className,
  shimmer = false,
  children,
  title,
}: {
  className?: string;
  /** Sweep a highlight across the title while the step runs. */
  shimmer?: boolean;
  children: string;
  title?: string;
}) {
  return (
    <span
      data-slot="trace-title"
      title={title}
      className={cn("min-w-0 truncate", className)}
    >
      {shimmer ? (
        <Shimmer as="span" duration={2.5} spread={1.5}>
          {children}
        </Shimmer>
      ) : (
        children
      )}
    </span>
  );
}

export function TraceDescription({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-description"
      className={cn("shrink-0 tabular-nums opacity-70", className)}
      {...props}
    />
  );
}

export function TraceCollapsible({
  className,
  ...props
}: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="trace-collapsible"
      className={cn("flex w-full min-w-0 flex-col", className)}
      {...props}
    />
  );
}

export function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="trace-collapsible-trigger"
      className={cn(
        "group/trace-trigger flex w-fit max-w-full min-w-0 items-center gap-1 rounded-md text-left text-muted-foreground transition-colors hover:text-foreground has-[[data-status=error]]:text-destructive",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45",
        className,
      )}
      {...props}
    >
      {children}
      <TraceIcon className="transition-transform group-aria-expanded/trace-trigger:rotate-90">
        <IconChevronRight />
      </TraceIcon>
    </CollapsibleTrigger>
  );
}

/** Folded body, indented behind a rail that starts under the icon's centre. */
export function TraceCollapsibleContent({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="trace-collapsible-content"
      className="min-w-0"
      {...props}
    >
      <div
        className={cn(
          "mt-2 mb-1 ml-[calc(--spacing(2)-1px)] min-w-0 border-l border-border pr-1 pl-4 leading-relaxed wrap-break-word text-muted-foreground",
          className,
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}
