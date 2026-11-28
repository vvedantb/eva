"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { UserMessageAvatar } from "@/lib/components/UserMessageAvatar";

/**
 * "N replies" with the latest repliers' avatars, as Slack shows a thread. It
 * sits in the message's footer row and, unlike the hover actions there, is
 * always visible. Opens the thread. "N new" follows when the reader follows
 * the thread and has replies they have not seen (`threads.readState`).
 */
export function ThreadSummary({
  rootId,
  replyCount,
  replierIds,
  onOpen,
}: {
  rootId: string;
  replyCount: number;
  replierIds: readonly Id<"users">[];
  onOpen: () => void;
}) {
  const unread = useQuery(api.threads.readState, { rootId })?.unread ?? 0;
  return (
    // design-check-ignore-next-line — avatars and a count in one pill; Button would force control height
    <button
      type="button"
      onClick={onOpen}
      className="flex shrink-0 items-center gap-1.5 rounded-control px-1 py-0.5 text-xs hover:bg-accent-soft"
    >
      {replierIds.length > 0 ? (
        <span className="flex -space-x-1">
          {replierIds.map((userId) => (
            <UserMessageAvatar key={userId} userId={userId} />
          ))}
        </span>
      ) : null}
      <span className="font-medium text-primary">
        {replyCount === 1 ? "1 reply" : `${replyCount} replies`}
      </span>
      {unread > 0 ? (
        <span className="rounded-full bg-mention px-1.5 text-2xs font-medium text-mention-foreground tabular-nums">
          {unread} new
        </span>
      ) : null}
    </button>
  );
}
