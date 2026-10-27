"use client";

import { cn } from "@eva/ui";
import { CountPop, countLabel } from "@vvedantb/ui";

/**
 * Shape and placement of a count badge hung off a tile's bottom-right corner;
 * the tone (unread vs live) is the caller's single extra class. Shared by the
 * rail tiles and the Manager Ave launcher so they cannot drift apart.
 */
export const CORNER_BADGE_CLASS =
  "absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none";

/** The primary unread count on a rail tile or the Ave launcher. */
export function UnreadCornerBadge({ count }: { count: number | undefined }) {
  return (
    <CountPop
      label={countLabel(count)}
      className={cn(CORNER_BADGE_CLASS, "bg-primary text-primary-foreground")}
    />
  );
}
