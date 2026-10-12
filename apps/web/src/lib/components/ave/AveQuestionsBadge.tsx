"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { UnreadCornerBadge } from "@/lib/components/ui/CountPop";

/**
 * How many routed questions are waiting on the user, on whichever button
 * summons Manager Ave — the questions are answered in Ave's dock. Bottom-right,
 * like a rail tile's unread count, so it never sits on the green "working" pip
 * in the opposite corner.
 */
export function AveQuestionsBadge() {
  return (
    <UnreadCornerBadge
      count={useQuery(api.routedThreads.countWaitingForMe, {})}
    />
  );
}
