"use client";

import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { UserInitials } from "@eva/shared/user-initials";
import { getUserDisplayName } from "./task-detail-constants";

type User = NonNullable<FunctionReturnType<typeof api.users.listAll>>[number];

/** First rail event: who created the task and when. */
export function CreatedTimelineItem({
  createdAt,
  creatorUser,
  isProjectTask,
}: {
  createdAt: number;
  creatorUser: User | undefined;
  isProjectTask: boolean;
}) {
  const actorName = creatorUser ? getUserDisplayName(creatorUser) : "Someone";
  const actionLabel = isProjectTask
    ? "created the task"
    : "created the quick task";

  return (
    <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
      <span className="relative z-10 flex size-4 shrink-0 items-center justify-center bg-background">
        {creatorUser ? (
          <UserInitials
            userId={creatorUser._id}
            user={creatorUser}
            size="sm"
            hideLastSeen
          />
        ) : (
          <span className="size-1.5 rounded-full bg-border" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span data-pii className="font-medium text-foreground">
          {actorName}
        </span>
        {` ${actionLabel}`}
        <span className="text-muted-foreground/50" aria-hidden>
          {" "}
          ·{" "}
        </span>
        <RelativeDateTime at={createdAt} className="text-muted-foreground/70" />
      </span>
    </div>
  );
}
