import type { Doc } from "@eva/backend";

export type NotificationType = Doc<"notifications">["type"];
type Urgency = NonNullable<Doc<"notifications">["urgency"]>;

/** How a notification type is emailed: on its own soon after, in the daily digest, or never. */
export type NotificationEmail = "instant" | "digest" | "none";

export type NotificationRoute = {
  inbox: "needs_you" | "updates";
  toast: boolean;
  push: boolean;
  email: NotificationEmail;
};

export const NOTIFICATION_ROUTES: Record<NotificationType, NotificationRoute> =
  {
    mention: { inbox: "needs_you", toast: true, push: true, email: "instant" },
    routed_question: {
      inbox: "needs_you",
      toast: true,
      push: true,
      email: "instant",
    },
    comment_reply: {
      inbox: "updates",
      toast: true,
      push: true,
      email: "instant",
    },
    task_assigned: {
      inbox: "updates",
      toast: true,
      push: true,
      email: "instant",
    },
    comment_added: {
      inbox: "updates",
      toast: true,
      push: false,
      email: "digest",
    },
    changes_requested: {
      inbox: "updates",
      toast: true,
      push: false,
      email: "none",
    },
    task_complete: {
      inbox: "updates",
      toast: false,
      push: false,
      email: "digest",
    },
    status_changed: {
      inbox: "updates",
      toast: false,
      push: false,
      email: "digest",
    },
    session_archived: {
      inbox: "updates",
      toast: false,
      push: false,
      email: "none",
    },
    system: { inbox: "updates", toast: true, push: false, email: "digest" },
  };

/** The fields routing reads off a notification row. */
export type RoutableNotification = {
  type: NotificationType;
  urgency?: Urgency;
  commentId?: string;
  chatTarget?: string;
};

function isChatMention(notification: RoutableNotification): boolean {
  return (
    notification.type === "mention" && notification.commentId === undefined
  );
}

/**
 * A chat mention whose routing has not landed yet. The web holds its toast
 * until it has, so an incidental mention never announces itself.
 */
export function isAwaitingRouting(notification: RoutableNotification): boolean {
  return isChatMention(notification) && notification.urgency === undefined;
}

/** Whether the web toasts it (and raises a desktop pop-up when unfocused). */
export function notificationToasts(notification: RoutableNotification): boolean {
  if (notification.urgency === "low") return false;
  if (notification.urgency === "high") return true;
  return NOTIFICATION_ROUTES[notification.type].toast;
}

/** Whether it pushes to the phone. */
export function notificationPushes(notification: RoutableNotification): boolean {
  if (notification.urgency === "low") return false;
  if (notification.urgency === "high") return true;
  return NOTIFICATION_ROUTES[notification.type].push;
}

/**
 * How it is emailed. An unrouted chat mention (routing pending or failed
 * before urgency existed) keeps the table's instant email.
 */
export function notificationEmail(
  notification: RoutableNotification,
): NotificationEmail {
  if (notification.urgency === "low") return "none";
  if (notification.urgency === "high") return "instant";
  if (notification.urgency === "normal" && isChatMention(notification)) {
    return "digest";
  }
  return NOTIFICATION_ROUTES[notification.type].email;
}

/**
 * Whether an unread, unarchived row is an Inbox → Needs you question: a
 * mention or routed question, or an agent message (`notify_user`) about a
 * chat. Needs a chat, which is where Reply goes and what posting in clears.
 */
export function isNeedsYouNotification(
  notification: RoutableNotification,
): boolean {
  if (notification.chatTarget === undefined) return false;
  if (notification.type === "system") return true;
  return NOTIFICATION_ROUTES[notification.type].inbox === "needs_you";
}
