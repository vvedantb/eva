import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { coordinatorPausedTitle } from "@eva/shared/projectView";
import { useQuery } from "convex/react";
import { Text, View } from "react-native";
import { NeedsYouMark } from "@/ui/RowStatus";
import { useScheme } from "@/ui/theme";

/**
 * The coordinator chat's "needs you" line while the hourly cap of automatic
 * turns holds its wake-ups back (`getCoordinatorState`), as the web
 * `CoordinatorPausedBanner`. A person's message releases them, so the line
 * sits above the composer, on the muted fill with the warning triangle.
 */
export function CoordinatorPausedBanner({ projectId }: { projectId: Id<"projects"> }) {
  const theme = EVA_THEME[useScheme()];
  const state = useQuery(api.projects.getCoordinatorState, { projectId });
  if (!state?.paused) return null;
  return (
    <View className="mx-3 mb-2 flex-row items-center gap-2.5 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
      <NeedsYouMark size={18} />
      <Text className="font-instrument-sans-medium min-w-0 flex-1 text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
        {coordinatorPausedTitle(state.maxAutoTurnsPerHour)}
      </Text>
    </View>
  );
}
