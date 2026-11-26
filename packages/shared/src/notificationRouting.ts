import type { Doc } from "@eva/backend";

/**
 * Where each notification type is delivered: the one routing table
 * (`internal/plans/todo/notifications-v2-5.md`, "Proposed design"). The
 * backend reads it to push and to pick the instant email or the daily digest;
 * the web reads it to toast and raise desktop pop-ups; Inbox → Needs you reads
 * it for its question rows.
 *
 * Urgency is a modifier on top of the table. Mention routing (Jev) sets it on
 * chat mentions; agent `notify_user` and comment mentions set it at creation.
 * - `high`: push, toast and an instant email, whatever the type says.
 * - `normal`: the table, except a chat mention Jev judged fyi, which waits
 *   for the digest.
 * - `low`: inbox only (no toast, push or email).
 */

export type NotificationType = Doc<"notifications">["type"];
type Urgency = NonNullable<Doc<"notifications">["urgency"]>;

/** How a notification type is emailed: on its own soon after, in the daily digest, or never. */
export type NotificationEmail = "instant" | "digest" | "none";

export type NotificationRoute = {
  /** The Inbox view that asks you to act. Every row is also in Updates. */
  inbox: "needs_you" | "updates";
  /** Web toast, chime and desktop pop-up. */
  toast: boolean;
  /** Phone push. */
  push: boolean;
  email: NotificationEmail;
};

/** Types no code creates any more. Inbox only until `dataMigrations:deleteDeadNotifications` removes their rows. */
const LEGACY: NotificationRoute = {
  inbox: "updates",
  toast: false,
  push: false,
  email: "none",
};

export const NOTIFICATION_ROUTES: Record<NotificationType, NotificationRoute> =
  {
    // @mention of you (chat or comment).
    mention: { inbox: "needs_you", toast: true, push: true, email: "instant" },
    // Eva asks you / a routed question or its reply.
    routed_question: {
      inbox: "needs_you",
      toast: true,
      push: true,
      email: "instant",
    },
    // Reply to your comment, or in a thread you are in.
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
    // Comment on a task or doc you follow.
    comment_added: {
      inbox: "updates",
      toast: true,
      push: false,
      email: "digest",
    },
    // A "Make changes" comment re-runs Eva: in-app only.
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
    // A session archived because its PR merged or closed: inbox only.
    session_archived: {
      inbox: "updates",
      toast: false,
      push: false,
      email: "none",
    },
    // An agent's `notify_user`, an automation's email draft. An agent message
    // about a chat also asks for you (`isNeedsYouNotification`).
    system: { inbox: "updates", toast: true, push: false, email: "digest" },
    routine_complete: LEGACY,
    run_completed: LEGACY,
    run_failed: LEGACY,
  };

/** The fields routing reads off a notification row. */
export type RoutableNotification = {
  type: NotificationType;
  urgency?: Urgency;
  commentId?: string;
  chatTarget?: string;
};

/**
 * A chat mention: Jev judges it after it is written (`mentionRouting`).
 * Comment mentions carry their comment and are not judged.
 */
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
