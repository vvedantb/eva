"use client";

import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { UserInitials } from "@eva/shared/user-initials";
import { IconArrowRight } from "@tabler/icons-react";

type TaskActivityEvent = NonNullable<
  FunctionReturnType<typeof api.taskActivity.listByTask>
>[number];

type User = NonNullable<FunctionReturnType<typeof api.users.listAll>>[number];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  todo: "To Do",
  in_progress: "In Progress",
  code_review: "Code Review",
  business_review: "Business Review",
  done: "Done",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatFieldLabel(field: TaskActivityEvent["field"]): string {
  switch (field) {
    case "status":
      return "status";
    case "assignee":
      return "assignee";
    case "project":
      return "project";
    case "priority":
      return "priority";
    case "title":
      return "title";
    case "description":
      return "description";
    case "tags":
      return "tags";
    case "model":
      return "model";
    case "baseBranch":
      return "base branch";
    case "pr":
      return "PR";
  }
}

function formatValue(
  field: TaskActivityEvent["field"],
  value: string | undefined,
  users: User[] | undefined,
): string {
  if (!value) return "none";
  switch (field) {
    case "status":
      return STATUS_LABELS[value] ?? value;
    case "priority":
      return PRIORITY_LABELS[value] ?? value;
    case "assignee": {
      const user = users?.find((u) => u._id === value);
      return user?.fullName?.trim() || "Unknown";
    }
    case "description":
      return value.length > 50 ? `${value.slice(0, 47)}...` : value;
    default:
      return value;
  }
}

function getUserName(
  userId: string | undefined,
  users: User[] | undefined,
): string {
  if (!userId) return "System";
  const user = users?.find((u) => u._id === userId);
  return user?.fullName?.trim() || "Someone";
}

export function TaskActivityItem({
  event,
  users,
}: {
  event: TaskActivityEvent;
  users: User[] | undefined;
}) {
  // PR merge/close is a GitHub-driven event, not a field edit, so it reads as a
  // sentence rather than an "X → Y" change and has no actor avatar.
  if (event.field === "pr") {
    const merged = event.newValue === "merged";
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
        <span className="relative z-10 flex size-4 shrink-0 items-center justify-center bg-background">
          <span className="size-1.5 rounded-full bg-border" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">GitHub</span>
          {merged
            ? " merged the PR — task moved to "
            : " closed the PR — task moved to "}
          <span className="font-medium text-foreground/80">
            {merged ? "Done" : "Cancelled"}
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

  const actor = event.userId
    ? users?.find((u) => u._id === event.userId)
    : undefined;
  const actorName = getUserName(event.userId, users);
  const fieldLabel = formatFieldLabel(event.field);
  const oldFormatted = formatValue(event.field, event.oldValue, users);
  const newFormatted = formatValue(event.field, event.newValue, users);

  const showValues = event.field !== "description";

  return (
    <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
      {/* Fixed slot on the shared timeline rail — bg masks the connector. */}
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
        {showValues && (
          <>
            {" from "}
            <span
              data-pii={event.field === "assignee" || undefined}
              className="font-medium text-foreground/80"
            >
              {oldFormatted}
            </span>
            <IconArrowRight size={10} className="inline mx-0.5 align-middle" />
            <span
              data-pii={event.field === "assignee" || undefined}
              className="font-medium text-foreground/80"
            >
              {newFormatted}
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
