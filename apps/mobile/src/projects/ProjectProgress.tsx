import type { ProjectStatus } from "@eva/shared/projectStatus";
import { PROJECT_TASK_DISPLAY_STATUSES, PROJECT_TASK_DISPLAY_STATUS_LABELS, projectStatusSegments } from "@eva/shared/projectView";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { Text, View } from "react-native";
import { taskDisplayStatusAppearance } from "@/projects/phaseAppearance";
import { useScheme, XS_TRACKING } from "@/ui/theme";

function shownStatuses(status: Pick<ProjectStatus, "counts">) {
  return PROJECT_TASK_DISPLAY_STATUSES.filter((displayStatus) => status.counts[displayStatus] > 0);
}

/**
 * The web `ProjectProgressBar`: a round track with one coloured part per
 * task display status (`projectStatusSegments`), in each status's stripe
 * colour. The web hover tooltip ("1 Needs you, 2 Working", or "No tasks
 * yet") is the bar's spoken label here. `thin` is the list row's 4 high bar;
 * the Overview's is 6.
 */
export function ProjectProgress({ status, thin = false }: { status: Pick<ProjectStatus, "counts">; thin?: boolean }) {
  const scheme = useScheme();
  const secondary = EVA_THEME[scheme].secondary;
  const segments = projectStatusSegments(status);
  const label =
    segments.length === 0
      ? "No tasks yet"
      : shownStatuses(status)
          .map((displayStatus) => `${status.counts[displayStatus]} ${PROJECT_TASK_DISPLAY_STATUS_LABELS[displayStatus]}`)
          .join(", ");
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className={`${thin ? "h-1" : "h-1.5"} overflow-hidden rounded-full`}
      style={{ backgroundColor: withAlpha(secondary, segments.length === 0 ? 0.85 : thin ? 0.8 : 1) }}
    >
      {segments.map((segment) => (
        <View
          key={segment.status}
          className="absolute inset-y-0"
          style={{
            left: `${segment.offset * 100}%`,
            width: `${segment.ratio * 100}%`,
            backgroundColor: taskDisplayStatusAppearance(segment.status, scheme).bar,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The web `ProjectStageCounts`: the task counts by display status ("2
 * Working · 1 Needs you"), each in its task list group's icon and colour, from
 * live data. Nothing renders without tasks.
 */
export function ProjectStageCounts({ status }: { status: Pick<ProjectStatus, "counts"> }) {
  const scheme = useScheme();
  const shown = shownStatuses(status);
  if (shown.length === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
      {shown.map((displayStatus) => {
        const { icon: Icon, text } = taskDisplayStatusAppearance(displayStatus, scheme);
        return (
          <View key={displayStatus} className="flex-row items-center gap-1">
            <Icon size={12} color={text} />
            <Text
              className="font-instrument-sans"
              style={{ fontSize: 12, lineHeight: 16, letterSpacing: XS_TRACKING, color: text, fontVariant: ["tabular-nums"] }}
            >
              {`${status.counts[displayStatus]} ${PROJECT_TASK_DISPLAY_STATUS_LABELS[displayStatus]}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
