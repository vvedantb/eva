import type { Doc } from "@eva/backend";

/**
 * How each notification type looks in the inbox, shared by the web and mobile
 * inboxes. Data only: each app maps `icon` to its own Tabler component
 * (`@tabler/icons-react` or `-react-native`) and `tone` to its colours.
 */

/** The colour family: the web `bg-<tone>/10` tint and `text-<tone>` glyph (secondary and muted are flat). */
export type NotificationTone =
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "secondary"
  | "muted";

/** The Tabler icon, by its component name without the `Icon` prefix. */
export type NotificationIconName =
  | "Repeat"
  | "Check"
  | "UserPlus"
  | "Progress"
  | "Message"
  | "Pencil"
  | "MessageReply"
  | "At"
  | "PlayerPlay"
  | "ExclamationCircle"
  | "InfoCircle"
  | "Archive"
  | "GitMerge"
  | "GitPullRequestClosed"
  | "MessageQuestion";

export type NotificationAppearance = {
  icon: NotificationIconName;
  label: string;
  tone: NotificationTone;
};

type AppearanceInput = Pick<Doc<"notifications">, "type" | "title" | "message">;

const TYPE_APPEARANCE: Record<
  Doc<"notifications">["type"],
  NotificationAppearance
> = {
  task_complete: { icon: "Check", label: "Task Done", tone: "success" },
  task_assigned: { icon: "UserPlus", label: "Assigned", tone: "warning" },
  status_changed: { icon: "Progress", label: "Status", tone: "secondary" },
  comment_added: { icon: "Message", label: "Comment", tone: "primary" },
  changes_requested: { icon: "Pencil", label: "Changes", tone: "warning" },
  comment_reply: { icon: "MessageReply", label: "Reply", tone: "primary" },
  mention: { icon: "At", label: "Mention", tone: "primary" },
  system: { icon: "InfoCircle", label: "System", tone: "muted" },
  session_archived: { icon: "Archive", label: "Archived", tone: "secondary" },
  routed_question: {
    icon: "MessageQuestion",
    label: "Question",
    tone: "primary",
  },
  // Legacy rows, until `dataMigrations:deleteDeadNotifications` deletes them.
  routine_complete: { icon: "Repeat", label: "Routine", tone: "secondary" },
  run_completed: { icon: "PlayerPlay", label: "Run Done", tone: "success" },
  run_failed: {
    icon: "ExclamationCircle",
    label: "Run Failed",
    tone: "destructive",
  },
};

const PR_MERGED: NotificationAppearance = {
  icon: "GitMerge",
  label: "PR Merged",
  tone: "success",
};
const PR_CLOSED: NotificationAppearance = {
  icon: "GitPullRequestClosed",
  label: "PR Closed",
  tone: "secondary",
};

/** Title and message, lower case, for the reads below. */
function haystack(notification: AppearanceInput): string {
  return `${notification.title} ${notification.message ?? ""}`.toLowerCase();
}

/**
 * The appearance of one notification. `session_archived` items come from a
 * GitHub PR merge or close, so they name the PR outcome instead of only
 * "Archived". `\bmerged\b` does not match "without merging" on a close.
 */
export function getNotificationAppearance(
  notification: AppearanceInput,
): NotificationAppearance {
  if (notification.type === "session_archived") {
    const text = haystack(notification);
    if (/\bmerged\b/.test(text)) return PR_MERGED;
    if (/\bclosed\b/.test(text)) return PR_CLOSED;
  }
  return TYPE_APPEARANCE[notification.type];
}
