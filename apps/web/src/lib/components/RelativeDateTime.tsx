"use client";

import { compactRelativeTime, formatExactDateTime } from "@eva/shared/dates";
import { cn } from "@eva/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vvedantb/ui";

interface RelativeDateTimeProps {
  /** Unix ms timestamp. When omitted, renders `emptyLabel` without a tooltip. */
  at?: number;
  emptyLabel?: string;
  className?: string;
}

/** Abbreviated relative time ("15m", "2d") with the exact datetime in a hover tooltip. */
export function RelativeDateTime({
  at,
  emptyLabel = "Queued",
  className,
}: RelativeDateTimeProps) {
  if (at === undefined) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        {emptyLabel}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-default text-muted-foreground tabular-nums",
            className,
          )}
        >
          {compactRelativeTime(at)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatExactDateTime(at)}</TooltipContent>
    </Tooltip>
  );
}
