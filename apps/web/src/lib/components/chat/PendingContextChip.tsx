"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@eva/ui";
import { IconX } from "@tabler/icons-react";

/** Wrapping row of pending context chips above the composer. */
export function PendingContextChipRow({
  testId,
  children,
}: {
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5" data-testid={testId}>
      {children}
    </div>
  );
}

/** One removable context chip: icon + truncated label, details in a tooltip. */
export function PendingContextChip({
  icon,
  label,
  tooltip,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  tooltip: ReactNode;
  onRemove: () => void;
}) {
  return (
    <Tooltip>
      <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card py-0.5 pl-2 pr-1 text-xs text-foreground">
        <TooltipTrigger asChild>
          <span className="inline-flex min-w-0 flex-1 items-center gap-1">
            {icon}
            <span className="truncate">{label}</span>
          </span>
        </TooltipTrigger>
        <button
          type="button"
          className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <IconX className="size-3" />
        </button>
      </span>
      <TooltipContent side="top" className="max-w-80">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
