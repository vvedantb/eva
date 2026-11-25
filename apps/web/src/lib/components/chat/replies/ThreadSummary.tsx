"use client";

import type { Id } from "@eva/backend";
import { UserMessageAvatar } from "@/lib/components/UserMessageAvatar";

/**
 * "N replies" with the latest repliers' avatars, as Slack shows a thread. It
 * sits in the message's footer row and, unlike the hover actions there, is
 * always visible. Opens the thread.
 */
export function ThreadSummary({
  replyCount,
  replierIds,
  onOpen,
}: {
  replyCount: number;
  replierIds: readonly Id<"users">[];
  onOpen: () => void;
}) {
  return (
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
    </button>
  );
}
