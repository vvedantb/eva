"use client";

import type { ReactNode } from "react";
import { cn } from "@eva/ui";

/**
 * One filter button in a comments panel header row (doc comments' Open /
 * Resolved, preview comments' On this page / All comments).
 */
export function CommentFilterTab({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "max-sm:hit-target rounded-md px-2 max-sm:py-1 text-xs font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent-soft-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
