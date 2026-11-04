"use client";

import { IconDots } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import {
  SESSIONS_LEADING_SLOT,
  SESSIONS_ROW_X,
} from "@/lib/components/sidebar/_utils/sessionsSidebarLayout";

interface SessionListShowMoreProps {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}

/** Inline expand/collapse control for overflow non-archived sessions (t3code-style). */
export function SessionListShowMore({
  expanded,
  hiddenCount,
  onToggle,
}: SessionListShowMoreProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 rounded-menu-item py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        SESSIONS_ROW_X,
      )}
    >
      <span className={SESSIONS_LEADING_SLOT}>
        <IconDots size={12} />
      </span>
      {expanded
        ? "Show less"
        : hiddenCount > 0
          ? `Show more (${hiddenCount})`
          : "Show more"}
    </button>
  );
}
