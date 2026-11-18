import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconRobot } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { EmptyState, ListDivider, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RepoSection } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

type AutomationRow = FunctionReturnType<typeof api.automations.list>[number];

/**
 * The web Automations sidebar group for one repo (`GlobalAutomationGroup`):
 * the repo's automations, each a row with the web's dot (green while it is
 * on) and its title. A tap opens it (`/automation/<id>`). Not here from the
 * web: New automation and the Automations Hub (system automations).
 */
export function AutomationsSection() {
  return (
    <RepoSection icon={IconRobot} placeholder={<Placeholders />}>
      {(repo) => <AutomationList repoId={repo._id} />}
    </RepoSection>
  );
}

function AutomationList({ repoId }: { repoId: Id<"githubRepos"> }) {
  const automations = useQuery(api.automations.list, { repoId });
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  if (automations === undefined) return <Placeholders />;
  if (automations.length === 0) {
    return <EmptyState icon={IconRobot} title="No automations yet" description="Create one on the web. It shows up here." />;
  }
  return (
    <FlatList
      data={automations}
      keyExtractor={(automation) => automation._id}
      {...LIST_WINDOW}
      ItemSeparatorComponent={ListDivider}
      renderItem={({ item }) => <AutomationListRow automation={item} repoId={repoId} />}
      contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
    />
  );
}

function AutomationListRow({ automation, repoId }: { automation: AutomationRow; repoId: Id<"githubRepos"> }) {
  const router = useRouter();
  const theme = EVA_THEME[useScheme()];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${automation.title}, ${automation.enabled ? "on" : "off"}`}
      onPress={() => router.push({ pathname: "/automation/[automationId]", params: { automationId: automation._id, repo: repoId } })}
      className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:opacity-70"
    >
      {/* The web row dot: green while the automation is on. */}
      <View className="size-2 rounded-full" style={{ backgroundColor: automation.enabled ? theme.success : theme.mutedForeground }} />
      <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: theme.foreground }}>
        {automation.title}
      </Text>
    </Pressable>
  );
}

function Placeholders() {
  return <SkeletonList label="Loading automations" count={8} renderRow={(row) => <SkeletonRow index={row} />} />;
}
