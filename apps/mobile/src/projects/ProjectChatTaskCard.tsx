import type { Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectChatTaskCard } from "@eva/shared/projectView";
import { SurfaceRow } from "@vvedantb/native-ui/primitives";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { taskDisplayStatusAppearance } from "@/projects/phaseAppearance";
import { useProjectTaskStatus } from "@/projects/useProjectStatus";
import { META_TEXT } from "@/quickTasks/QuickTaskRow";
import { displayTitle } from "@/ui/format";
import { useScheme } from "@/ui/theme";

/**
 * A task Eva created or gave work to in this turn, under her reply, as the
 * web `ProjectChatTaskCard`: the Tasks list's status icon, "#N title" and the
 * task's stage, live from the project's task list. A tap opens the task's
 * chat. A task the reader cannot open, or no longer in the list, shows nothing.
 */
export function ProjectChatTaskCard({
  taskId,
  projectId,
  repoId,
}: {
  taskId: Id<"agentTasks">;
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const { tasks, failedTaskIds } = useProjectTaskStatus(projectId, repoId);
  const card = projectChatTaskCard(tasks ?? [], taskId, failedTaskIds);
  if (card === null) return null;
  const { icon: StatusIcon, text } = taskDisplayStatusAppearance(card.view.displayStatus, scheme);
  const title = displayTitle(card.title);
  return (
    <SurfaceRow
      accessibilityLabel={`#${card.numId} ${title}, ${card.stageLabel}`}
      accessibilityHint="Opens the task's chat"
      backgroundColor={theme.muted}
      className="min-h-11 flex-row items-center gap-2 rounded-xl px-3 py-2"
      onPress={() => router.push({ pathname: "/chat/[target]", params: { target: taskId } })}
    >
      <StatusIcon size={14} color={text} />
      <Text className="font-instrument-sans" style={{ ...META_TEXT, color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}>
        #{card.numId}
      </Text>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
          {title}
        </Text>
      </View>
      <Text className="font-instrument-sans" style={{ ...META_TEXT, color: theme.mutedForeground }}>
        {card.stageLabel}
      </Text>
    </SurfaceRow>
  );
}
