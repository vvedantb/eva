"use client";

import { AnimatePresence, m } from "motion/react";
import { Badge, motionFast } from "@eva/ui";
import type { Doc } from "@eva/backend";
import {
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

export const PROJECT_PHASES: ProjectPhase[] = [
  "draft",
  "finalized",
  "in_progress",
  "business_review",
  "code_review",
  "completed",
  "cancelled",
];

/** Phases a user can manually switch to via the status dropdown.
 *  Excludes draft/finalized — those are driven by the planning/interview flow. */
export const ACTIVE_PROJECT_PHASES: ProjectPhase[] = [
  "in_progress",
  "business_review",
  "code_review",
  "completed",
  "cancelled",
];

/** Phases where the autonomous "Build Project" workflow can be started. */
export const BUILDABLE_PROJECT_PHASES: ProjectPhase[] = [
  "in_progress",
  "business_review",
  "code_review",
];

export const phaseConfig: Record<
  ProjectPhase,
  {
    bg: string;
    cardBg: string;
    bar: string;
    text: string;
    label: string;
    icon: typeof IconNotes;
  }
> = {
  draft: {
    bg: "bg-secondary",
    cardBg: "bg-secondary/40",
    bar: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    label: "Draft",
    icon: IconNotes,
  },
  finalized: {
    bg: "bg-blue-500/10",
    cardBg: "bg-blue-500/5",
    bar: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    label: "Finalized",
    icon: IconCheck,
  },
  in_progress: {
    bg: "bg-status-progress-bg",
    cardBg: "bg-status-progress-subtle/40",
    bar: "bg-status-progress-bar",
    text: "text-status-progress",
    label: "In Progress",
    icon: IconClock,
  },
  business_review: {
    bg: "bg-status-business-review-bg",
    cardBg: "bg-status-business-review-subtle/40",
    bar: "bg-status-business-review-bar",
    text: "text-status-business-review",
    label: "Business Review",
    icon: IconClipboardCheck,
  },
  code_review: {
    bg: "bg-status-code-review-bg",
    cardBg: "bg-status-code-review-subtle/40",
    bar: "bg-status-code-review-bar",
    text: "text-status-code-review",
    label: "Code Review",
    icon: IconEye,
  },
  completed: {
    bg: "bg-status-done-bg",
    cardBg: "bg-status-done-subtle/40",
    bar: "bg-status-done-bar",
    text: "text-status-done",
    label: "Merged",
    icon: IconCircleCheck,
  },
  cancelled: {
    bg: "bg-status-cancelled-bg",
    cardBg: "bg-status-cancelled-subtle/40",
    bar: "bg-status-cancelled-bar",
    text: "text-status-cancelled",
    label: "Cancelled",
    icon: IconCircleX,
  },
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
        transition={motionFast}
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
