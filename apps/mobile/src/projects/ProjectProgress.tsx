import { TASK_STATUSES, TASK_STATUS_LABELS, projectProgressSegments, type ProjectTaskProgress } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { View } from "react-native";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { useScheme } from "@/ui/theme";

/**
 * The web `ProjectProgressBar`: a round track with one coloured part per
 * task status, in workflow order, in each status's stripe colour. The web
 * hover tooltip ("2 To Do, 1 Code Review", or "No tasks yet") is the bar's
 * spoken label here. `thin` is the list row's 4 high bar; the Overview's is 6.
 */
export function ProjectProgress({ progress, thin = false }: { progress: ProjectTaskProgress; thin?: boolean }) {
  const scheme = useScheme();
  const secondary = EVA_THEME[scheme].secondary;
  const segments = projectProgressSegments(progress);
  const label =
    progress.total === 0
      ? "No tasks yet"
      : TASK_STATUSES.filter((status) => progress[status] > 0)
          .map((status) => `${progress[status]} ${TASK_STATUS_LABELS[status]}`)
          .join(", ");
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className={`${thin ? "h-1" : "h-1.5"} overflow-hidden rounded-full`}
      style={{ backgroundColor: withAlpha(secondary, progress.total === 0 ? 0.85 : thin ? 0.8 : 1) }}
    >
      {segments.map((segment) => (
        <View
          key={segment.status}
          className="absolute inset-y-0"
          style={{
            left: `${segment.offset * 100}%`,
            width: `${segment.ratio * 100}%`,
            backgroundColor: statusAppearance(segment.status, scheme).bar,
          }}
        />
      ))}
    </View>
  );
}
