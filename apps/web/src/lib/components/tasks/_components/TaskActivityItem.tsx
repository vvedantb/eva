"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import {
  describeTaskActivity,
  type TaskActivityEvent,
} from "@eva/shared/taskDetail";
import { UserInitials } from "@eva/shared/user-initials";
import { IconArrowRight } from "@tabler/icons-react";
import { RelativeDateTime } from "@vvedantb/ui";

type User = NonNullable<FunctionReturnType<typeof api.users.listAll>>[number];

export function TaskActivityItem({
  event,
  users,
}: {
  event: TaskActivityEvent;
  users: User[] | undefined;
}) {
  const description = describeTaskActivity(event, users);
  if (description.kind === "pr") {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
        <span className="relative z-10 flex size-4 shrink-0 items-center justify-center bg-background">
          <span className="size-1.5 rounded-full bg-border" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">GitHub</span>
          {description.merged
            ? " merged the PR — task moved to "
            : " closed the PR — task moved to "}
          <span className="font-medium text-foreground/80">
            {description.movedTo}
          </span>
          <span className="text-muted-foreground/50" aria-hidden>
            {" "}
            ·{" "}
          </span>
          <RelativeDateTime
            at={event.createdAt}
            className="text-muted-foreground/70"
          />
        </span>
      </div>
    );
  }

  const { actor, actorName, fieldLabel, values } = description;

  return (
    <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
      <span className="relative z-10 flex size-4 shrink-0 items-center justify-center bg-background">
        {event.userId && actor ? (
          <UserInitials
            userId={event.userId}
            user={actor}
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
        {" changed "}
        <span className="font-medium">{fieldLabel}</span>
        {values && (
          <>
            {" from "}
            <span
              data-pii={event.field === "assignee" || undefined}
              className="font-medium text-foreground/80"
            >
              {values.from}
            </span>
            <IconArrowRight size={10} className="inline mx-0.5 align-middle" />
            <span
              data-pii={event.field === "assignee" || undefined}
              className="font-medium text-foreground/80"
            >
              {values.to}
            </span>
          </>
        )}
        <span className="text-muted-foreground/50" aria-hidden>
          {" "}
          ·{" "}
        </span>
        <RelativeDateTime
          at={event.createdAt}
          className="text-muted-foreground/70"
        />
      </span>
    </div>
  );
}
