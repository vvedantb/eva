import {
  PROJECT_STAGE_TONE,
  PROJECT_TASK_DISPLAY_STATUS_TONE,
  type ProjectStage,
  type ProjectTaskDisplayStatus,
  type ProjectTone,
} from "@eva/shared/projectStatus";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconAlertTriangle } from "@tabler/icons-react-native";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import type { Scheme } from "@/ui/theme";

function toneAppearance(tone: ProjectTone, scheme: Scheme) {
  if (tone === "warning") {
    const warning = EVA_THEME[scheme].warning;
    return { icon: IconAlertTriangle, text: warning, bar: warning };
  }
  return statusAppearance(tone, scheme);
}

/** A project stage's icon and colours. */
export function projectStageAppearance(stage: ProjectStage, scheme: Scheme) {
  return toneAppearance(PROJECT_STAGE_TONE[stage], scheme);
}

/** A child task's display status: the task list groups, a project's task counts and its progress bar. */
export function taskDisplayStatusAppearance(status: ProjectTaskDisplayStatus, scheme: Scheme) {
  return toneAppearance(PROJECT_TASK_DISPLAY_STATUS_TONE[status], scheme);
}
