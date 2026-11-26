import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectTaskPrLine, type ProjectTaskView } from "@eva/shared/projectView";
import { IconLock } from "@tabler/icons-react-native";
import { SurfaceRow } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { taskDisplayStatusAppearance } from "@/projects/phaseAppearance";
import type { ProjectTaskListRow } from "@/projects/useProjectStatus";
import { META_TEXT } from "@/quickTasks/QuickTaskRow";
import { PrIcon } from "@/sessions/SessionGroup";
import { displayTitle, timeAgo } from "@/ui/format";
import { useScheme } from "@/ui/theme";

/**
 * The web flat row body (`ProjectFlatRowBody`): an icon, the title on one
 * line, one muted sentence under it, and `trailing` at the end. No fill: the
 * row fades while pressed.
 */
function FlatRow({
  icon,
  title,
  line,
  trailing,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onLongPress,
}: {
  icon: ReactNode;
  title: string;
  line: string;
  trailing?: ReactNode;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  return (
    <SurfaceRow
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint ?? line}
      backgroundColor="transparent"
      className="min-h-11 flex-row items-start gap-2.5 px-2 py-2"
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel="Task actions"
    >
      <View className="h-5 justify-center">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
          {title}
        </Text>
        <Text numberOfLines={1} className="font-instrument-sans" style={{ ...META_TEXT, color: theme.mutedForeground }}>
          {line}
        </Text>
      </View>
      {trailing}
    </SurfaceRow>
  );
}

/**
 * One flat row of a project's task list, as the web `ProjectTaskRow`: the
 * display status icon in its colour, the title, and `line`
 * (`projectTaskSummaryLine`), with the age at the end. A tap opens the
 * task's chat; a long press opens the task menu (`onLongPress`). A task in a
 * repo the reader cannot open is a locked row with no link.
 */
export function ProjectTaskRow({
  task,
  view,
  line,
  onLongPress,
}: {
  task: ProjectTaskListRow;
  view: ProjectTaskView;
  line: string;
  onLongPress?: () => void;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const { icon: StatusIcon, text } = taskDisplayStatusAppearance(view.displayStatus, scheme);
  const icon = <StatusIcon size={14} color={text} />;
  if (task.locked === true) {
    return (
      <FlatRow
        icon={icon}
        title="Locked task"
        line={line}
        trailing={<IconLock size={14} color={muted} />}
        accessibilityLabel="Locked task"
        accessibilityHint="You do not have access to this repo"
        onPress={() => toast("You do not have access to this repo")}
      />
    );
  }
  return (
    <FlatRow
      icon={icon}
      title={displayTitle(task.title)}
      line={line}
      trailing={
        <Text className="font-instrument-sans" style={{ ...META_TEXT, color: withAlpha(muted, 0.7), fontVariant: ["tabular-nums"] }}>
          {timeAgo(task.updatedAt)}
        </Text>
      }
      accessibilityLabel={displayTitle(task.title)}
      // A project task is its chat.
      onPress={() => router.push({ pathname: "/chat/[target]", params: { target: task._id } })}
      onLongPress={onLongPress}
    />
  );
}

/** A Pull requests row, as the web `ProjectTaskPrRow`: a tap opens the PR. */
export function ProjectTaskPrRow({ task }: { task: ProjectTaskListRow & { prUrl: string; repoName?: string } }) {
  const scheme = useScheme();
  return (
    <FlatRow
      icon={<PrIcon state={task.prState} scheme={scheme} />}
      title={displayTitle(task.title)}
      line={projectTaskPrLine(task)}
      accessibilityLabel={`Open the PR for ${displayTitle(task.title)}`}
      onPress={() => void Linking.openURL(task.prUrl)}
    />
  );
}
