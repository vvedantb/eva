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
  IconMessageQuestion,
} from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { Avatar, AvatarFallback } from "@vvedantb/ui";
import type { BadgeProps } from "@vvedantb/ui";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import {
  getNotificationAppearance as sharedAppearance,
  type NotificationIconName,
  type NotificationTone,
} from "@eva/shared";

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

/** The Tabler component for each shared icon name. */
const ICONS: Record<NotificationIconName, typeof IconBell> = {
  Repeat: IconRepeat,
  FileExport: IconFileExport,
  Check: IconCheck,
  UserPlus: IconUserPlus,
  Progress: IconProgress,
  Message: IconMessage,
  Pencil: IconPencil,
  MessageReply: IconMessageReply,
  At: IconAt,
  PlayerPlay: IconPlayerPlay,
  ExclamationCircle: IconExclamationCircle,
  AlertTriangle: IconAlertTriangle,
  InfoCircle: IconInfoCircle,
  Archive: IconArchive,
  GitMerge: IconGitMerge,
  GitPullRequestClosed: IconGitPullRequestClosed,
  MessageQuestion: IconMessageQuestion,
};

/** The badge variant, avatar tint and glyph colour of each shared tone. */
const TONE_CLASSES: Record<
  NotificationTone,
  Pick<NotificationAppearance, "badgeVariant" | "iconBg" | "iconColor">
> = {
  primary: {
    badgeVariant: "default",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  success: {
    badgeVariant: "success",
    iconBg: "bg-success/10",
    iconColor: "text-success",
  },
  warning: {
    badgeVariant: "warning",
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
  },
  destructive: {
    badgeVariant: "destructive",
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
  },
  secondary: {
    badgeVariant: "secondary",
    iconBg: "bg-secondary",
    iconColor: "text-secondary-foreground",
  },
  muted: {
    badgeVariant: "outline",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
  },
};

/**
 * The type's icon, label and colours. The type map and its title reads (old
 * failures, PR merge or close) are `@eva/shared/notificationAppearance`, which
 * the mobile inbox uses too.
 */
export function getNotificationAppearance(
  notification: Pick<Notification, "type" | "title" | "message">,
): NotificationAppearance {
  const { icon, label, tone } = sharedAppearance(notification);
  return { icon: ICONS[icon], label, ...TONE_CLASSES[tone] };
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
