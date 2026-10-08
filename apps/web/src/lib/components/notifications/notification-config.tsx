"use client";

import {
  type IconBell,
  IconRepeat,
  IconFileExport,
  IconCheck,
  IconAlertTriangle,
  IconExclamationCircle,
  IconInfoCircle,
  IconUserPlus,
  IconMessage,
  IconMessageReply,
  IconAt,
  IconPlayerPlay,
  IconProgress,
  IconPencil,
  IconArchive,
  IconGitMerge,
  IconGitPullRequestClosed,
} from "@tabler/icons-react";
import { Avatar, AvatarFallback, cn } from "@eva/ui";
import type { BadgeProps } from "@eva/ui";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";

export type Notification = FunctionReturnType<
  typeof api.notifications.list
>[number];

export type NotificationAppearance = {
  icon: typeof IconBell;
  label: string;
  badgeVariant: BadgeProps["variant"];
  iconBg: string;
  iconColor: string;
};

const typeConfig: Record<Notification["type"], NotificationAppearance> = {
  routine_complete: {
    icon: IconRepeat,
    label: "Routine",
    badgeVariant: "secondary",
    iconBg: "bg-secondary",
    iconColor: "text-secondary-foreground",
  },
  export_ready: {
    icon: IconFileExport,
    label: "Export",
    badgeVariant: "default",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  task_complete: {
    icon: IconCheck,
    label: "Task Done",
    badgeVariant: "success",
    iconBg: "bg-success/10",
    iconColor: "text-success",
  },
  task_assigned: {
    icon: IconUserPlus,
    label: "Assigned",
    badgeVariant: "warning",
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
  },
  status_changed: {
    icon: IconProgress,
    label: "Status",
    badgeVariant: "secondary",
    iconBg: "bg-secondary",
    iconColor: "text-secondary-foreground",
  },
  comment_added: {
    icon: IconMessage,
    label: "Comment",
    badgeVariant: "default",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  changes_requested: {
    icon: IconPencil,
    label: "Changes",
    badgeVariant: "warning",
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
  },
  comment_reply: {
    icon: IconMessageReply,
    label: "Reply",
    badgeVariant: "default",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  mention: {
    icon: IconAt,
    label: "Mention",
    badgeVariant: "default",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  run_completed: {
    icon: IconPlayerPlay,
    label: "Run Done",
    badgeVariant: "success",
    iconBg: "bg-success/10",
    iconColor: "text-success",
  },
  run_failed: {
    icon: IconExclamationCircle,
    label: "Run Failed",
    badgeVariant: "destructive",
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
  },
  rate_limit: {
    icon: IconAlertTriangle,
    label: "Rate Limit",
    badgeVariant: "warning",
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
  },
  system: {
    icon: IconInfoCircle,
    label: "System",
    badgeVariant: "outline",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
  },
  session_archived: {
    icon: IconArchive,
    label: "Archived",
    badgeVariant: "secondary",
    iconBg: "bg-secondary",
    iconColor: "text-secondary-foreground",
  },
};

const sessionPrMergedAppearance: NotificationAppearance = {
  icon: IconGitMerge,
  label: "PR Merged",
  badgeVariant: "success",
  iconBg: "bg-success/10",
  iconColor: "text-success",
};

const sessionPrClosedAppearance: NotificationAppearance = {
  icon: IconGitPullRequestClosed,
  label: "PR Closed",
  badgeVariant: "secondary",
  iconBg: "bg-secondary",
  iconColor: "text-secondary-foreground",
};

/**
 * Session auto-archive inbox items are typed `session_archived`, but the
 * reason is a GitHub PR merge or close. Read that from the stored title and
 * message so the badge says the PR outcome instead of only "Archived".
 * `\bmerged\b` does not match "without merging" on a close.
 */
function sessionArchivedAppearance(
  notification: Pick<Notification, "title" | "message">,
): NotificationAppearance {
  const haystack =
    `${notification.title} ${notification.message ?? ""}`.toLowerCase();
  if (/\bmerged\b/.test(haystack)) return sessionPrMergedAppearance;
  if (/\bclosed\b/.test(haystack)) return sessionPrClosedAppearance;
  return typeConfig.session_archived;
}

/**
 * Older failures were stored as `run_completed` with a "failed" title/message.
 * Map those to the danger appearance until they age out of inboxes.
 */
export function getNotificationAppearance(
  notification: Pick<Notification, "type" | "title" | "message">,
): NotificationAppearance {
  if (notification.type === "run_failed") {
    return typeConfig.run_failed;
  }
  if (notification.type === "run_completed") {
    const haystack =
      `${notification.title} ${notification.message ?? ""}`.toLowerCase();
    if (haystack.includes("failed")) {
      return typeConfig.run_failed;
    }
  }
  if (notification.type === "session_archived") {
    return sessionArchivedAppearance(notification);
  }
  return typeConfig[notification.type];
}

/**
 * The type marker as a bare coloured glyph, for the inbox's trailing status
 * column: a green check for done, a red circle for failed, and so on. No
 * container — it reads as a status, not as a second avatar.
 */
export function NotificationStatusIcon({
  notification,
  className,
}: {
  notification: Pick<Notification, "type" | "title" | "message">;
  className?: string;
}) {
  const config = getNotificationAppearance(notification);
  const Icon = config.icon;

  return (
    <span
      role="img"
      aria-label={config.label}
      title={config.label}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center",
        className,
      )}
    >
      <Icon size={16} className={config.iconColor} />
    </span>
  );
}

export function NotificationIcon({
  notification,
  size = "sm",
}: {
  notification: Pick<Notification, "type" | "title" | "message">;
  size?: "sm" | "md";
}) {
  const config = getNotificationAppearance(notification);
  const Icon = config.icon;
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconSize = size === "sm" ? 16 : 20;

  return (
    <Avatar className={`${dim} rounded-lg shrink-0`}>
      <AvatarFallback className={`rounded-lg ${config.iconBg}`}>
        <Icon size={iconSize} className={config.iconColor} />
      </AvatarFallback>
    </Avatar>
  );
}
