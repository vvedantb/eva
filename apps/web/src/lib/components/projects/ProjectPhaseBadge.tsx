"use client";

import { AnimatePresence, m } from "motion/react";
import { Badge, tokenTransition } from "@vvedantb/ui";
import type { Doc } from "@eva/backend";
import {
  PROJECT_COLUMN_LABELS,
  PROJECT_PHASE_LABELS,
  type ProjectColumn,
} from "@eva/shared";
import {
  IconCircle,
  IconNotes,
  IconCheck,
  IconClock,
  IconClipboardCheck,
  IconEye,
  IconCircleCheck,
  IconCircleX,
} from "@tabler/icons-react";

/** Single source of truth: matches Convex `projects.phase`. */
export type ProjectPhase = Doc<"projects">["phase"];

export { PROJECT_PHASES } from "@eva/backend";

export { ACTIVE_PROJECT_PHASES, BUILDABLE_PROJECT_PHASES } from "@eva/shared";

interface PhaseStyle {
  bg: string;
  cardBg: string;
  bar: string;
  /** CSS colour of `bar`, for the timeline's Gantt status. */
  barColor: string;
  text: string;
  label: string;
  icon: typeof IconNotes;
}

export const phaseConfig: Record<ProjectPhase, PhaseStyle> = {
  draft: {
    bg: "bg-secondary",
    cardBg: "bg-secondary/40",
    bar: "bg-muted-foreground/50",
    barColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
    text: "text-muted-foreground",
    label: PROJECT_PHASE_LABELS.draft,
    icon: IconNotes,
  },
  finalized: {
    bg: "bg-blue-500/10",
    cardBg: "bg-blue-500/5",
    bar: "bg-blue-500",
    barColor: "rgb(59 130 246)",
    text: "text-blue-600 dark:text-blue-400",
    label: PROJECT_PHASE_LABELS.finalized,
    icon: IconCheck,
  },
  in_progress: {
    bg: "bg-status-progress-bg",
    cardBg: "bg-status-progress-subtle/40",
    bar: "bg-status-progress-bar",
    barColor: "var(--status-progress-bar)",
    text: "text-status-progress",
    label: PROJECT_PHASE_LABELS.in_progress,
    icon: IconClock,
  },
  business_review: {
    bg: "bg-status-business-review-bg",
    cardBg: "bg-status-business-review-subtle/40",
    bar: "bg-status-business-review-bar",
    barColor: "var(--status-business-review-bar)",
    text: "text-status-business-review",
    label: PROJECT_PHASE_LABELS.business_review,
    icon: IconClipboardCheck,
  },
  code_review: {
    bg: "bg-status-code-review-bg",
    cardBg: "bg-status-code-review-subtle/40",
    bar: "bg-status-code-review-bar",
    barColor: "var(--status-code-review-bar)",
    text: "text-status-code-review",
    label: PROJECT_PHASE_LABELS.code_review,
    icon: IconEye,
  },
  completed: {
    bg: "bg-status-done-bg",
    cardBg: "bg-status-done-subtle/40",
    bar: "bg-status-done-bar",
    barColor: "var(--status-done-bar)",
    text: "text-status-done",
    label: PROJECT_PHASE_LABELS.completed,
    icon: IconCircleCheck,
  },
  cancelled: {
    bg: "bg-status-cancelled-bg",
    cardBg: "bg-status-cancelled-subtle/40",
    bar: "bg-status-cancelled-bar",
    barColor: "var(--status-cancelled-bar)",
    text: "text-status-cancelled",
    label: PROJECT_PHASE_LABELS.cancelled,
    icon: IconCircleX,
  },
};

/**
 * List sections and kanban columns. "To Do" (draft and finalized projects)
 * matches the quick-task To Do column; the rest are their phase's style.
 */
export const columnConfig: Record<ProjectColumn, PhaseStyle> = {
  todo: {
    bg: "bg-secondary",
    cardBg: "bg-secondary/40",
    bar: "bg-foreground/50",
    barColor: "color-mix(in oklab, var(--foreground) 50%, transparent)",
    text: "text-muted-foreground",
    label: PROJECT_COLUMN_LABELS.todo,
    icon: IconCircle,
  },
  in_progress: phaseConfig.in_progress,
  business_review: phaseConfig.business_review,
  code_review: phaseConfig.code_review,
  completed: phaseConfig.completed,
  cancelled: phaseConfig.cancelled,
};

interface ProjectPhaseBadgeProps {
  phase: ProjectPhase;
}

export function ProjectPhaseBadge({ phase }: ProjectPhaseBadgeProps) {
  const config = phaseConfig[phase];
  const Icon = config.icon;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={tokenTransition.fast}
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
