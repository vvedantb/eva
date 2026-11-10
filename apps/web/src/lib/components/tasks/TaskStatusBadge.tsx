"use client";

import { AnimatePresence, m } from "motion/react";
import { Badge, motionEase } from "@vvedantb/ui";
import {
  IconCircle,
  IconClock,
  IconClipboardCheck,
  IconEye,
  IconCircleCheck,
  IconCircleX,
  IconPencil,
} from "@tabler/icons-react";
import { TASK_STATUS_LABELS, type TaskStatus } from "@eva/shared";

export {
  TASK_STATUSES,
  statusWorkflowOrder,
  type DisplayTaskStatus,
  type TaskStatus,
} from "@eva/shared";

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export const statusConfig: Record<
  TaskStatus,
  {
    bg: string;
    cardBg: string;
    bar: string;
    text: string;
    label: string;
    icon: typeof IconCircle;
  }
> = {
  draft: {
    bg: "bg-secondary",
    cardBg: "bg-secondary/40",
    bar: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    label: TASK_STATUS_LABELS.draft,
    icon: IconPencil,
  },
  todo: {
    bg: "bg-secondary",
    cardBg: "bg-secondary/40",
    bar: "bg-foreground/50",
    text: "text-muted-foreground",
    label: TASK_STATUS_LABELS.todo,
    icon: IconCircle,
  },
  in_progress: {
    bg: "bg-status-progress-bg",
    cardBg: "bg-status-progress-subtle/40",
    bar: "bg-status-progress-bar",
    text: "text-status-progress",
    label: TASK_STATUS_LABELS.in_progress,
    icon: IconClock,
  },
  code_review: {
    bg: "bg-status-code-review-bg",
    cardBg: "bg-status-code-review-subtle/40",
    bar: "bg-status-code-review-bar",
    text: "text-status-code-review",
    label: TASK_STATUS_LABELS.code_review,
    icon: IconEye,
  },
  business_review: {
    bg: "bg-status-business-review-bg",
    cardBg: "bg-status-business-review-subtle/40",
    bar: "bg-status-business-review-bar",
    text: "text-status-business-review",
    label: TASK_STATUS_LABELS.business_review,
    icon: IconClipboardCheck,
  },
  done: {
    bg: "bg-status-done-bg",
    cardBg: "bg-status-done-subtle/40",
    bar: "bg-status-done-bar",
    text: "text-status-done",
    label: TASK_STATUS_LABELS.done,
    icon: IconCircleCheck,
  },
  cancelled: {
    bg: "bg-status-cancelled-bg",
    cardBg: "bg-status-cancelled-subtle/40",
    bar: "bg-status-cancelled-bar",
    text: "text-status-cancelled",
    label: TASK_STATUS_LABELS.cancelled,
    icon: IconCircleX,
  },
};

/**
 * A status change here is the one thing a user waits for while an agent works,
 * and it used to arrive as a hard swap of three things at once — icon, label and
 * colour token. The crossfade is keyed on `status`, so the outgoing badge leaves
 * while the incoming one arrives and the change reads as one event.
 *
 * `initial={false}` is deliberate, and is the opposite call to the one on the
 * home repo grid: these badges render inside task lists and kanban columns
 * dozens at a time, so animating them on first paint would be a wave of
 * flickering status pills. Only an actual transition animates.
 *
 * `mode="wait"` rather than `popLayout`: the label width changes between
 * statuses ("To Do" → "Business Review"), and overlapping two differently-sized
 * pills in the same box makes the row jitter. Half of `--motion-fast` each way
 * keeps the whole exchange inside one `--motion-fast` beat.
 */
export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={status}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.075, ease: motionEase }}
        className="inline-flex"
      >
        <Badge className={`${config.text} ${config.bg} border-transparent`}>
          <Icon size={14} className={`mr-1 ${config.text}`} />
          {config.label}
        </Badge>
      </m.span>
    </AnimatePresence>
  );
}
