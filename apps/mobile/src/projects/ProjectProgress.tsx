import type { ProjectStatus } from "@eva/shared/projectStatus";
import { PROJECT_STAGE_COUNT_ORDER, PROJECT_TASK_STAGE_LABELS, projectStageSegments } from "@eva/shared/projectView";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { Text, View } from "react-native";
import { taskStageAppearance } from "@/projects/phaseAppearance";
import { useScheme, XS_TRACKING } from "@/ui/theme";

/** The stages a project's counts show, most finished first; empty stages are left out. */
function shownStages(status: Pick<ProjectStatus, "counts">) {
  return PROJECT_STAGE_COUNT_ORDER.filter((stage) => status.counts[stage] > 0);
}

/**
 * The web `ProjectProgressBar`: a round track with one coloured part per
 * derived task stage (`projectStageSegments`), in each stage's stripe
 * colour. The web hover tooltip ("2 Launched, 1 In Review", or "No tasks
 * yet") is the bar's spoken label here. `thin` is the list row's 4 high bar;
 * the Overview's is 6.
 */
export function ProjectProgress({ status, thin = false }: { status: Pick<ProjectStatus, "counts">; thin?: boolean }) {
  const scheme = useScheme();
  const secondary = EVA_THEME[scheme].secondary;
  const segments = projectStageSegments(status);
  const label =
    segments.length === 0
      ? "No tasks yet"
      : shownStages(status)
          .map((stage) => `${status.counts[stage]} ${PROJECT_TASK_STAGE_LABELS[stage]}`)
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
          key={segment.stage}
          className="absolute inset-y-0"
          style={{
            left: `${segment.offset * 100}%`,
            width: `${segment.ratio * 100}%`,
            backgroundColor: taskStageAppearance(segment.stage, scheme).bar,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The web `ProjectStageCounts`: the task counts by derived stage ("2
 * Launched · 1 In Review"), each in its stage's icon and colour, from live
 * data. Nothing renders without tasks.
 */
export function ProjectStageCounts({ status }: { status: Pick<ProjectStatus, "counts"> }) {
  const scheme = useScheme();
  const shown = shownStages(status);
  if (shown.length === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
      {shown.map((stage) => {
        const { icon: Icon, text } = taskStageAppearance(stage, scheme);
        return (
          <View key={stage} className="flex-row items-center gap-1">
            <Icon size={12} color={text} />
            <Text
              className="font-instrument-sans"
              style={{ fontSize: 12, lineHeight: 16, letterSpacing: XS_TRACKING, color: text, fontVariant: ["tabular-nums"] }}
            >
              {`${status.counts[stage]} ${PROJECT_TASK_STAGE_LABELS[stage]}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
