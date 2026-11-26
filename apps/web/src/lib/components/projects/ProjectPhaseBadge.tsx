"use client";

import { Badge } from "@vvedantb/ui";
import type {
  ProjectStage,
  ProjectTaskDisplayStatus,
} from "@eva/shared/projectStatus";
import {
  PROJECT_STAGE_LABELS,
  PROJECT_TASK_DISPLAY_STATUS_LABELS,
} from "@eva/shared/projectView";
import {
  IconAlertTriangle,
  IconCircle,
  IconClock,
  IconCircleCheck,
  IconCircleX,
  IconInbox,
} from "@tabler/icons-react";

export interface PhaseStyle {
  bg: string;
  cardBg: string;
  bar: string;
  barColor: string;
  text: string;
  label: string;
  icon: typeof IconCircle;
}

const todoStyle: PhaseStyle = {
  bg: "bg-secondary",
  cardBg: "bg-secondary/40",
  bar: "bg-foreground/50",
  barColor: "color-mix(in oklab, var(--foreground) 50%, transparent)",
  text: "text-muted-foreground",
  label: PROJECT_STAGE_LABELS.todo,
  icon: IconCircle,
};

const inProgressStyle: PhaseStyle = {
  bg: "bg-status-progress-bg",
  cardBg: "bg-status-progress-subtle/40",
  bar: "bg-status-progress-bar",
  barColor: "var(--status-progress-bar)",
  text: "text-status-progress",
  label: PROJECT_STAGE_LABELS.in_progress,
  icon: IconClock,
};

const triageStyle: PhaseStyle = {
  bg: "bg-status-code-review-bg",
  cardBg: "bg-status-code-review-subtle/40",
  bar: "bg-status-code-review-bar",
  barColor: "var(--status-code-review-bar)",
  text: "text-status-code-review",
  label: PROJECT_TASK_DISPLAY_STATUS_LABELS.triage,
  icon: IconInbox,
};

const doneStyle: PhaseStyle = {
  bg: "bg-status-done-bg",
  cardBg: "bg-status-done-subtle/40",
  bar: "bg-status-done-bar",
  barColor: "var(--status-done-bar)",
  text: "text-status-done",
  label: PROJECT_STAGE_LABELS.done,
  icon: IconCircleCheck,
};

const cancelledStyle: PhaseStyle = {
  bg: "bg-status-cancelled-bg",
  cardBg: "bg-status-cancelled-subtle/40",
  bar: "bg-status-cancelled-bar",
  barColor: "var(--status-cancelled-bar)",
  text: "text-status-cancelled",
  label: PROJECT_TASK_DISPLAY_STATUS_LABELS.archived,
  icon: IconCircleX,
};

/**
 * A child task's display status (`projectTaskDisplayStatus`): the task list
 * groups and rows, and a project's task counts and progress bar. Triage
 * takes the code-review purple, Working looks as In Progress, Blocked as the
 * needs-you warning, Idle as To Do, Archived as cancelled.
 */
export const projectTaskDisplayStatusConfig: Record<
  ProjectTaskDisplayStatus,
  PhaseStyle
> = {
  triage: triageStyle,
  working: {
    ...inProgressStyle,
    label: PROJECT_TASK_DISPLAY_STATUS_LABELS.working,
  },
  blocked: {
    bg: "bg-warning-bg",
    cardBg: "bg-warning/5",
    bar: "bg-warning",
    barColor: "var(--warning)",
    text: "text-warning",
    label: PROJECT_TASK_DISPLAY_STATUS_LABELS.blocked,
    icon: IconAlertTriangle,
  },
  idle: {
    ...todoStyle,
    label: PROJECT_TASK_DISPLAY_STATUS_LABELS.idle,
  },
  archived: cancelledStyle,
};

/**
 * A project's derived stage (`projectStatus`): kanban columns, list
 * sections, badges. Done looks as Completed.
 */
export const projectStageConfig: Record<ProjectStage, PhaseStyle> = {
  todo: todoStyle,
  in_progress: inProgressStyle,
  done: doneStyle,
};

/** The project's derived stage, in the phase badge's look. */
export function ProjectStageBadge({ stage }: { stage: ProjectStage }) {
  const config = projectStageConfig[stage];
  const Icon = config.icon;
  return (
    <Badge className={`${config.text} ${config.bg} border-transparent`}>
      <Icon size={14} className={`mr-1 ${config.text}`} />
      {config.label}
    </Badge>
  );
}
