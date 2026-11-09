import type { Doc } from "@eva/backend";
import {
  IconAlertTriangle,
  IconArchive,
  IconAt,
  IconCheck,
  IconExclamationCircle,
  IconFileExport,
  IconInfoCircle,
  IconMessage,
  IconMessageQuestion,
  IconMessageReply,
  IconPencil,
  IconPlayerPlay,
  IconProgress,
  IconRepeat,
  IconUserPlus,
  type IconProps,
} from "@tabler/icons-react-native";
import type { ComponentType } from "react";

export type NotificationTone = "primary" | "success" | "warning" | "danger" | "muted";

/**
 * Each notification type's glyph, colour and label, as the web inbox
 * (`notification-config.tsx`: the same Tabler icons and labels; colours
 * `text-primary`, `text-success`, `text-warning`, `text-destructive`, else muted).
 */
export const NOTIFICATION_APPEARANCE: Record<
  Doc<"notifications">["type"],
  { icon: ComponentType<IconProps>; tone: NotificationTone; label: string }
> = {
  routine_complete: { icon: IconRepeat, tone: "muted", label: "Routine" },
  export_ready: { icon: IconFileExport, tone: "primary", label: "Export" },
  task_complete: { icon: IconCheck, tone: "success", label: "Task Done" },
  task_assigned: { icon: IconUserPlus, tone: "warning", label: "Assigned" },
  status_changed: { icon: IconProgress, tone: "muted", label: "Status" },
  comment_added: { icon: IconMessage, tone: "primary", label: "Comment" },
  changes_requested: { icon: IconPencil, tone: "warning", label: "Changes" },
  comment_reply: { icon: IconMessageReply, tone: "primary", label: "Reply" },
  mention: { icon: IconAt, tone: "primary", label: "Mention" },
  run_completed: { icon: IconPlayerPlay, tone: "success", label: "Run Done" },
  run_failed: { icon: IconExclamationCircle, tone: "danger", label: "Run Failed" },
  rate_limit: { icon: IconAlertTriangle, tone: "warning", label: "Rate Limit" },
  system: { icon: IconInfoCircle, tone: "muted", label: "System" },
  session_archived: { icon: IconArchive, tone: "muted", label: "Archived" },
  routed_question: { icon: IconMessageQuestion, tone: "primary", label: "Question" },
};
