"use client";

import { UnreadCornerBadge, UnreadDot } from "@vvedantb/ui";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useAveUnread } from "@/lib/components/ave/aveUnread";

/**
 * The corner cue on whichever button summons Manager Ave. Bottom-right, like a
 * rail tile's unread count, so it never sits on the green "working" pip in the
 * opposite corner.
 *
 * - Routed questions waiting on the user: their count. They are answered in
 *   Ave's dock, and a count says more than a dot.
 * - Otherwise, an unread Ave reply: a dot, until the chat is on screen. It
 *   pulses three times as it appears (`.ave-unread-dot` in globals.css).
 */
export function AveBadge() {
  const waitingCount = useQuery(api.routedThreads.countWaitingForMe, {});
  const hasUnread = useAveUnread();
  return (
    <>
      <UnreadCornerBadge count={waitingCount} />
      <UnreadDot
        show={hasUnread && !((waitingCount ?? 0) > 0)}
        className="ave-unread-dot absolute -bottom-0.5 -right-0.5 size-3"
      />
    </>
  );
}
