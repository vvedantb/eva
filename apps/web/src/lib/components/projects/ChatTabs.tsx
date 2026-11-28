"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@eva/ui";
import {
  LoadingState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { IconPlus, IconX } from "@tabler/icons-react";

/** A row of chat tabs that scrolls sideways (a project's Eva and task tabs). */
export function ChatTabStrip({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full shrink-0 items-center gap-1 overflow-x-auto px-2 pb-1.5 scrollbar-thin",
        className,
      )}
      role="tablist"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/**
 * One chat tab: tone-only selected fill, and the sidebar's Drive grid while
 * the chat works. `onClose` adds a ✕ after the label. The rest of the props
 * land on the tab's root, so a context menu trigger can wrap it.
 */
export function ChatTab({
  selected,
  running,
  label,
  hint,
  onSelect,
  onClose,
  closeLabel,
  narrow = false,
  className,
  ...root
}: ComponentProps<"div"> & {
  selected: boolean;
  running: boolean;
  label: ReactNode;
  hint?: string;
  onSelect: () => void;
  onClose?: () => void;
  closeLabel?: string;
  narrow?: boolean;
}) {
  return (
    <div
      {...root}
      className={cn(
        "flex h-8 shrink-0 items-center rounded-lg motion-base",
        selected ? "bg-card" : "hover:bg-muted/80",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        title={hint}
        ref={
          selected
            ? (el) => {
                el?.parentElement?.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              }
            : undefined
        }
        className={cn(
          "motion-press flex h-full min-w-20 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium active:scale-[0.96]",
          narrow ? "max-w-32" : "max-w-48",
          onClose ? "pr-1" : undefined,
          selected
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={onSelect}
      >
        {running ? (
          <span className="flex shrink-0 items-center" title="Working">
            <LoadingState label="Working" variant="Drive" size="sm" iconOnly />
          </span>
        ) : null}
        <span className="truncate">{label}</span>
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={closeLabel}
          className="motion-press mr-1 flex size-5 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.92]"
          onClick={onClose}
        >
          <IconX className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** The `+` at the end of a chat tab strip. */
export function ChatTabAddButton({
  label,
  tooltip,
  disabled = false,
  onClick,
}: {
  label: string;
  tooltip: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className="motion-press flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-[0.92] disabled:opacity-50"
          onClick={onClick}
        >
          <IconPlus className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
