"use client";

import { AnimatePresence, m } from "motion/react";
import { cn, motionBase, motionFast } from "@eva/ui";
import type { ReactNode } from "react";

/**
 * The entrance and exit for a live count badge — the unread dots on the rail
 * tiles, the drafts pill, the running-sessions count on a sidebar group.
 *
 * These numbers arrive over a Convex subscription while the user is looking at
 * something else, so the badge's job is to say *that a number changed*, not just
 * to display one. It pops from `scale(0.5)` on the emphasized curve rather than
 * materialising at full size, and re-pops on each subsequent change because the
 * key is the label: 2 → 3 remounts, so the same motion that announced the first
 * unread announces the next one. Exit is a plain shrink on `--motion-fast`,
 * since nothing is being announced when a count clears.
 *
 * `mode="popLayout"` takes the leaving badge out of flow, so a 9 → 10 change
 * does not shove its neighbours sideways for the length of the crossfade.
 *
 * Only the motion lives here. Each caller keeps its own `className`, because the
 * three badges are visually unrelated — an absolutely-positioned primary dot, a
 * tonal pill, a green-dot count — and only the behaviour was duplicated.
 */
export function CountPop({
  label,
  className,
  children,
}: {
  /** Rendered content, and the remount key. `null` renders nothing. */
  label: string | null;
  className?: string;
  /** Defaults to `label`; pass children for a badge with more than a number. */
  children?: ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout">
      {label === null ? null : (
        <m.span
          key={label}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5, transition: motionFast }}
          transition={{ ...motionBase, ease: [0.2, 0.8, 0.2, 1] }}
          className={className}
        >
          {children ?? label}
        </m.span>
      )}
    </AnimatePresence>
  );
}

/** `null` when there is nothing to show, so `CountPop` can render nothing. */
export function countLabel(count: number | undefined): string | null {
  if (count === undefined || count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

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
