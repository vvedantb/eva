import type { api } from "@eva/backend";
import { interviewTurnText, parseProjectSpec } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { Markdown } from "@vvedantb/native-ui/markdown";
import type { FunctionReturnType } from "convex/server";
import { ScrollView, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;

/**
 * The web Plan tab (`ProjectTabs`) of a draft or finalized project, read
 * only: the generated plan (title, description and its numbered tasks, as
 * the web `ProjectPlanDialog`) once there is one outside Draft, else the
 * interview so far (`interviewTurnText`), the user's turns on the end side.
 * Answering, approving and rejecting stay on the web; the last line says so.
 */
export function ProjectPlan({ project }: { project: Project }) {
  const theme = EVA_THEME[useScheme()];
  const muted = theme.mutedForeground;
  // As the web: back in Draft, the stored spec waits for the next run.
  const spec = project.phase !== "draft" && project.generatedSpec ? parseProjectSpec(project.generatedSpec) : null;
  const turns = project.conversationHistory.flatMap((turn, index) => {
    const text = turn.role === "user" ? turn.content : interviewTurnText(turn.content);
    return text ? [{ key: index, role: turn.role, text }] : [];
  });

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 12 }}>
      {spec ? (
        <>
          <View className="gap-1">
            <Text accessibilityRole="header" className="font-instrument-sans-semibold text-lg" style={{ fontWeight: "600", color: theme.foreground }}>
              {spec.title}
            </Text>
            <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
              {spec.description}
            </Text>
          </View>
          <Text accessibilityRole="header" className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
            {`Tasks (${spec.tasks.length})`}
          </Text>
          {spec.tasks.map((task, index) => (
            <View key={index} className="min-h-12 flex-row items-start gap-2 rounded-lg p-3" style={{ backgroundColor: theme.muted }}>
              <Text className="text-sm" style={{ fontFamily: "monospace", color: muted }}>{`${index + 1}.`}</Text>
              <Text className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: theme.foreground }}>
                {task.title}
              </Text>
            </View>
          ))}
        </>
      ) : (
        turns.map((turn) =>
          turn.role === "user" ? (
            <View key={turn.key} className="max-w-[85%] self-end rounded-2xl px-3 py-2" style={{ backgroundColor: theme.secondary }}>
              <Text className="font-instrument-sans text-sm" style={{ color: theme.foreground }}>
                {turn.text}
              </Text>
            </View>
          ) : (
            <View key={turn.key}>
              <Markdown>{turn.text}</Markdown>
            </View>
          ),
        )
      )}
      <Text className="font-instrument-sans text-xs" style={{ color: muted }}>
        Answer the interview and approve the plan on the web.
      </Text>
    </ScrollView>
  );
}
