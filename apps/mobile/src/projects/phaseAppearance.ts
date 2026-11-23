import type { ProjectColumn, ProjectPhase } from "@eva/shared";
import type { ProjectStage, ProjectTaskDisplayStatus } from "@eva/shared/projectStatus";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconClipboardCheck,
  IconClock,
  IconEye,
  IconNotes,
  type IconProps,
} from "@tabler/icons-react-native";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import type { Scheme } from "@/ui/theme";

/** The web `phaseConfig` icons (`ProjectPhaseBadge.tsx`). */
const PHASE_ICONS: Record<ProjectPhase, ComponentType<IconProps>> = {
  draft: IconNotes,
  finalized: IconCheck,
  in_progress: IconClock,
  business_review: IconClipboardCheck,
  code_review: IconEye,
  completed: IconCircleCheck,
  cancelled: IconCircleX,
};

/**
 * The web `phaseConfig` for the phone: each phase's icon, its text colour
 * (section headers, the badge) and its row stripe colour (`bar`).
 */
export function phaseAppearance(phase: ProjectPhase, scheme: Scheme) {
  const theme = EVA_THEME[scheme];
  const colours: Record<ProjectPhase, { text: string; bar: string }> = {
    // Web: `text-muted-foreground`, stripe `bg-muted-foreground/50`.
    draft: { text: theme.mutedForeground, bar: withAlpha(theme.mutedForeground, 0.5) },
    // Web: `text-blue-600 dark:text-blue-400`, stripe `bg-blue-500`.
    finalized: { text: scheme !== "light" ? "#60a5fa" : "#2563eb", bar: "#3b82f6" },
    in_progress: { text: theme.statusProgress, bar: theme.statusProgressBar },
    business_review: { text: theme.statusBusinessReview, bar: theme.statusBusinessReviewBar },
    code_review: { text: theme.statusCodeReview, bar: theme.statusCodeReviewBar },
    completed: { text: theme.statusDone, bar: theme.statusDoneBar },
    cancelled: { text: theme.statusCancelled, bar: theme.statusCancelledBar },
  };
  return { icon: PHASE_ICONS[phase], ...colours[phase] };
}

/** A list section's icon and colour: To Do as the quick-task To Do, the rest as their phase. */
export function columnAppearance(column: ProjectColumn, scheme: Scheme) {
  return column === "todo" ? statusAppearance("todo", scheme) : phaseAppearance(column, scheme);
}

/** A project stage's icon and colours, as the web `projectStageConfig`: Done looks as Completed. */
export function projectStageAppearance(stage: ProjectStage, scheme: Scheme) {
  return columnAppearance(stage === "done" ? "completed" : stage, scheme);
}

/**
 * A child task's display status, as the web `projectTaskDisplayStatusConfig`:
 * Working as In Progress, Blocked as the needs-you warning, Idle as To Do,
 * Archived as Cancelled. The task list groups, a project's task counts and
 * its progress bar.
 */
export function taskDisplayStatusAppearance(status: ProjectTaskDisplayStatus, scheme: Scheme) {
  if (status === "blocked") {
    const warning = EVA_THEME[scheme].warning;
    return { icon: IconAlertTriangle, text: warning, bar: warning };
  }
  const column: Record<Exclude<ProjectTaskDisplayStatus, "blocked">, ProjectColumn> = {
    working: "in_progress",
    idle: "todo",
    archived: "cancelled",
  };
  return columnAppearance(column[status], scheme);
}
