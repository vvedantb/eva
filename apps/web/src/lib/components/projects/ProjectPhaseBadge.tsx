"use client";

import { Badge } from "@vvedantb/ui";
import {
  PROJECT_STAGE_TONE,
  PROJECT_TASK_DISPLAY_STATUS_TONE,
  type ProjectStage,
  type ProjectTaskDisplayStatus,
  type ProjectTone,
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

const TONE_STYLE: Record<ProjectTone, Omit<PhaseStyle, "label">> = {
  todo: {
    bg: "bg-secondary",
    cardBg: "bg-secondary/40",
    bar: "bg-foreground/50",
    barColor: "color-mix(in oklab, var(--foreground) 50%, transparent)",
    text: "text-muted-foreground",
    icon: IconCircle,
  },
  in_progress: {
    bg: "bg-status-progress-bg",
    cardBg: "bg-status-progress-subtle/40",
    bar: "bg-status-progress-bar",
    barColor: "var(--status-progress-bar)",
    text: "text-status-progress",
    icon: IconClock,
  },
  done: {
    bg: "bg-status-done-bg",
    cardBg: "bg-status-done-subtle/40",
    bar: "bg-status-done-bar",
    barColor: "var(--status-done-bar)",
    text: "text-status-done",
    icon: IconCircleCheck,
  },
  cancelled: {
    bg: "bg-status-cancelled-bg",
    cardBg: "bg-status-cancelled-subtle/40",
    bar: "bg-status-cancelled-bar",
    barColor: "var(--status-cancelled-bar)",
    text: "text-status-cancelled",
    icon: IconCircleX,
  },
  warning: {
    bg: "bg-warning-bg",
    cardBg: "bg-warning/5",
    bar: "bg-warning",
    barColor: "var(--warning)",
    text: "text-warning",
    icon: IconAlertTriangle,
  },
};

function displayStatusStyle(status: ProjectTaskDisplayStatus): PhaseStyle {
  return {
    ...TONE_STYLE[PROJECT_TASK_DISPLAY_STATUS_TONE[status]],
    label: PROJECT_TASK_DISPLAY_STATUS_LABELS[status],
  };
}

function stageStyle(stage: ProjectStage): PhaseStyle {
  return {
    ...TONE_STYLE[PROJECT_STAGE_TONE[stage]],
    label: PROJECT_STAGE_LABELS[stage],
  };
}

/**
 * A child task's display status (`projectTaskDisplayStatus`): the task list
 * groups and rows, and a project's task counts and progress bar.
 */
export const projectTaskDisplayStatusConfig: Record<
  ProjectTaskDisplayStatus,
  PhaseStyle
> = {
  working: displayStatusStyle("working"),
  blocked: displayStatusStyle("blocked"),
  idle: displayStatusStyle("idle"),
  archived: displayStatusStyle("archived"),
};

/**
 * A project's derived stage (`projectStatus`): kanban columns, list
 * sections, badges.
 */
export const projectStageConfig: Record<ProjectStage, PhaseStyle> = {
  todo: stageStyle("todo"),
  in_progress: stageStyle("in_progress"),
  done: stageStyle("done"),
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
