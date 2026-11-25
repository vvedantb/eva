"use client";

import { cn } from "@eva/ui";
import type { Id } from "@eva/backend";
import { UserMessageAvatar } from "@/lib/components/UserMessageAvatar";

/**
 * The row under a message that has replies: the latest repliers' avatars and
 * "N replies", as Slack shows a thread. It sits under the bubble (past the
 * side avatar on the left), and opens the thread panel.
 */
export function ThreadSummary({
  replyCount,
  replierIds,
  align,
  onOpen,
}: {
  replyCount: number;
  replierIds: readonly Id<"users">[];
  align: "start" | "end";
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "mt-1 flex",
        align === "end" ? "justify-end" : "justify-start pl-6",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1.5 rounded-control px-1.5 py-0.5 text-xs hover:bg-accent-soft"
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
    </div>
  );
}
