import type { ProjectStage, ProjectTaskDisplayStatus } from "@eva/shared/projectStatus";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  type IconProps,
} from "@tabler/icons-react-native";
import type { ComponentType } from "react";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import type { Scheme } from "@/ui/theme";

/** The looks a project stage or a child task's status maps to. */
type Tone = "in_progress" | "completed" | "cancelled";

/** The web `phaseConfig` icons (`ProjectPhaseBadge.tsx`). */
const TONE_ICONS: Record<Tone, ComponentType<IconProps>> = {
  in_progress: IconClock,
  completed: IconCircleCheck,
  cancelled: IconCircleX,
};

/** One tone's icon, its text colour and its row stripe colour (`bar`). */
function toneAppearance(tone: Tone, scheme: Scheme) {
  const theme = EVA_THEME[scheme];
  const colours: Record<Tone, { text: string; bar: string }> = {
    in_progress: { text: theme.statusProgress, bar: theme.statusProgressBar },
    completed: { text: theme.statusDone, bar: theme.statusDoneBar },
    cancelled: { text: theme.statusCancelled, bar: theme.statusCancelledBar },
  };
  return { icon: TONE_ICONS[tone], ...colours[tone] };
}

/** A list section's icon and colour: To Do as the quick-task To Do, the rest as their tone. */
function columnAppearance(column: "todo" | Tone, scheme: Scheme) {
  return column === "todo" ? statusAppearance("todo", scheme) : toneAppearance(column, scheme);
}

/** A project stage's icon and colours, as the web `projectStageConfig`: Done looks as Completed. */
export function projectStageAppearance(stage: ProjectStage, scheme: Scheme) {
  return columnAppearance(stage === "done" ? "completed" : stage, scheme);
}

/**
 * A child task's display status, as the web `projectTaskDisplayStatusConfig`:
 * Working as In Progress, Needs you (`blocked`) as the warning, Idle as To
 * Do, Archived as Cancelled. The task list groups, a project's task counts and
 * its progress bar.
 */
export function taskDisplayStatusAppearance(status: ProjectTaskDisplayStatus, scheme: Scheme) {
  if (status === "blocked") {
    const warning = EVA_THEME[scheme].warning;
    return { icon: IconAlertTriangle, text: warning, bar: warning };
  }
  const column: Record<Exclude<ProjectTaskDisplayStatus, "blocked">, "todo" | Tone> = {
    working: "in_progress",
    idle: "todo",
    archived: "cancelled",
  };
  return columnAppearance(column[status], scheme);
}
