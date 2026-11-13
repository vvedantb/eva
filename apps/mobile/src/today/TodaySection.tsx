import { api, type Id } from "@eva/backend";
import { standupEntryHeading, standupEntryTime } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconSunrise } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { EmptyState, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RepoSection } from "@/ui/RepoPicker";
import { copyText } from "@/ui/copyText";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

/** The rail's left inset and the dot on it: the web `pl-6`, `size-2`, `ring-4`. */
const RAIL_INSET = 24;
const DOT = 8;
const RING = 4;

/**
 * Whether the Projects tab shows Today for a repo: while its Daily standup
 * automation is on, as the web sidebar, or while it has standups. The web
 * keeps a paused standup's page reachable by URL; a phone has no URL bar,
 * so the history keeps the section.
 */
export function useShowsToday(repoId: Id<"githubRepos"> | undefined) {
  const enabled = useQuery(api.today.isStandupEnabled, repoId ? { repoId } : "skip");
  const entries = useQuery(api.today.listStandups, repoId ? { repoId } : "skip");
  return enabled === true || (entries?.length ?? 0) > 0;
}

/**
 * The web Today page (`TodayClient`) for one repo: every published Daily
 * standup as a timeline, a rail down the left with a dot per entry (the
 * newest in the primary colour), each a card with its day and publish time
 * over the summary, its headings as quiet labels (`headings="label"`).
 * Not here from the web: the "Daily standup is off" state and its "Turn on
 * Daily standup" button, as the section only shows while the standup is on
 * or has history.
 */
export function TodaySection() {
  return (
    <RepoSection icon={IconSunrise} placeholder={<StandupPlaceholders />}>
      {(repo) => <StandupList repoId={repo._id} />}
    </RepoSection>
  );
}

function StandupList({ repoId }: { repoId: Id<"githubRepos"> }) {
  const entries = useQuery(api.today.listStandups, { repoId });
  const theme = EVA_THEME[useScheme()];
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  if (entries === undefined) return <StandupPlaceholders />;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={IconSunrise}
        title="No standups yet"
        description="The Daily standup automation is on — its first summary will show up here after the next scheduled run."
      />
    );
  }
  return (
    <FlatList
      {...LIST_WINDOW}
      data={entries}
      keyExtractor={(entry) => entry.id}
      renderItem={({ item: entry, index }) => (
        // The rail is a left border on every item with no gap between them, so it runs unbroken; the 16 between cards is padding.
        <View style={{ borderLeftWidth: 1, borderLeftColor: theme.border, paddingLeft: RAIL_INSET, paddingBottom: 16 }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              left: -(DOT / 2 + RING) - 0.5,
              top: 16 - RING,
              width: DOT + RING * 2,
              height: DOT + RING * 2,
              borderRadius: DOT,
              borderWidth: RING,
              borderColor: theme.background,
              backgroundColor: index === 0 ? theme.primary : theme.border,
            }}
          />
          <View className="rounded-lg" style={{ backgroundColor: theme.card }}>
            <View className="flex-row items-center justify-between gap-2 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text accessibilityRole="header" className="font-instrument-sans-semibold text-sm" style={{ fontWeight: "600", color: theme.foreground }}>
                {standupEntryHeading(entry.publishedAt)}
              </Text>
              <Text
                className="font-instrument-sans text-xs"
                style={{ color: theme.mutedForeground, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
              >
                {standupEntryTime(entry.publishedAt)}
              </Text>
            </View>
            <View className="px-4 py-3">
              <Markdown leading="normal" headings="label" onCopyCode={copyText} onCopyTable={copyText}>
                {entry.content}
              </Markdown>
            </View>
          </View>
        </View>
      )}
      // The web list `pl-6` rail sits 16 in from the page edge, as the web `comfortable` page padding.
      contentContainerStyle={{ paddingLeft: 20, paddingRight: 16, paddingTop: 8, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
    />
  );
}

/** While the standups load: cards shaped as an entry, 16 apart, on the rail's inset. */
function StandupPlaceholders() {
  const card = EVA_THEME[useScheme()].card;
  return (
    <SkeletonList
      label="Loading standups"
      count={3}
      divided={false}
      className="pl-11 pr-4"
      renderRow={(row) => (
        <View className="mb-4 rounded-lg" style={{ backgroundColor: card }}>
          <SkeletonRow index={row} lines={2} trailing={false} minHeight={160} className="px-4" />
        </View>
      )}
    />
  );
}
