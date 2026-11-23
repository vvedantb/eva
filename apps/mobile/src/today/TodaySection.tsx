import { api, type Id, type TodayItem } from "@eva/backend";
import {
  standupEntryHeading,
  standupEntryTime,
  TODAY_UPDATE_TITLE,
  todayMergedSince,
  todaySections,
  type TodaySectionId,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconSunrise } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { EmptyState, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Pressable, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { prStatusAppearance } from "@/reviews/prAppearance";
import { RepoSection } from "@/ui/RepoPicker";
import { AwaitingAnswerMark, WorkingMark } from "@/ui/RowStatus";
import { TimeAgo } from "@/ui/TimeAgo";
import { copyText } from "@/ui/copyText";
import { useScheme, XS_TRACKING } from "@/ui/theme";

/**
 * The web Today page (`TodayClient`) for one repo: the signed-in user's
 * Needs you, In progress and Merged items (shared `todaySections`, empty
 * ones hidden), then the latest Daily standup as an Update card while the
 * standup is on. A row opens its session, quick task or project.
 */
export function TodaySection() {
  return (
    <RepoSection icon={IconSunrise} placeholder={<TodayPlaceholders />}>
      {(repo) => <TodayList repoId={repo._id} />}
    </RepoSection>
  );
}

function TodayList({ repoId }: { repoId: Id<"githubRepos"> }) {
  const dashboard = useQuery(api.today.dashboard, {
    repoId,
    mergedSince: todayMergedSince(Date.now()),
  });
  const theme = EVA_THEME[useScheme()];
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  if (dashboard === undefined) return <TodayPlaceholders />;
  const sections = dashboard
    ? todaySections(dashboard).map((section) => ({ ...section, data: section.items }))
    : [];
  const standup = dashboard?.standup ?? null;
  if (sections.length === 0 && standup === null) {
    return <EmptyState icon={IconSunrise} title="Nothing needs you" />;
  }
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <SectionTitle title={section.title} count={section.data.length} />}
      renderItem={({ item, section, index }) => (
        <TodayRow
          item={item}
          repoId={repoId}
          sectionId={section.id}
          first={index === 0}
          last={index === section.data.length - 1}
        />
      )}
      ListFooterComponent={
        standup ? (
          <View>
            <SectionTitle title={TODAY_UPDATE_TITLE} />
            <View className="rounded-lg" style={{ backgroundColor: theme.card }}>
              <View className="flex-row items-center justify-between gap-2 px-4 pt-3">
                <Text accessibilityRole="header" className="font-instrument-sans-semibold text-sm" style={{ fontWeight: "600", color: theme.foreground }}>
                  {standupEntryHeading(standup.publishedAt)}
                </Text>
                <Text
                  className="font-instrument-sans text-xs"
                  style={{ color: theme.mutedForeground, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
                >
                  {standupEntryTime(standup.publishedAt)}
                </Text>
              </View>
              <View className="px-4 pb-3">
                <Markdown leading="normal" headings="label" onCopyCode={copyText} onCopyTable={copyText}>
                  {standup.content}
                </Markdown>
              </View>
            </View>
          </View>
        ) : null
      }
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
    />
  );
}

/** The web section title: sentence case in the foreground, the count muted and tabular beside it. */
function SectionTitle({ title, count }: { title: string; count?: number }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="mb-2 mt-6 flex-row items-baseline gap-1.5 px-1">
      <Text accessibilityRole="header" className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground }}>
        {title}
      </Text>
      {count === undefined ? null : (
        <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}>
          {count}
        </Text>
      )}
    </View>
  );
}

/**
 * One item on its section's card (rounded only on the card's ends): the
 * Sessions row's leading mark (the "?" in Needs you, else the working grid,
 * else the PR icon), the title, then when it last moved.
 */
function TodayRow({
  item,
  repoId,
  sectionId,
  first,
  last,
}: {
  item: TodayItem;
  repoId: Id<"githubRepos">;
  sectionId: TodaySectionId;
  first: boolean;
  last: boolean;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const open = () => {
    if (item.kind === "session") router.push({ pathname: "/chat/[target]", params: { target: item.id } });
    else if (item.kind === "task") router.push({ pathname: "/quick-task/[taskId]", params: { taskId: item.id, repo: repoId } });
    else router.push({ pathname: "/project/[projectId]", params: { projectId: item.id, repo: repoId } });
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={open}
      className="min-h-14 flex-row items-center gap-3 px-4 active:opacity-70"
      style={{
        backgroundColor: theme.card,
        borderTopLeftRadius: first ? 8 : 0,
        borderTopRightRadius: first ? 8 : 0,
        borderBottomLeftRadius: last ? 8 : 0,
        borderBottomRightRadius: last ? 8 : 0,
      }}
    >
      <View className="w-[18px] items-center">
        {sectionId === "needsMe" ? (
          <AwaitingAnswerMark />
        ) : item.working ? (
          <WorkingMark />
        ) : (
          <TodayPrIcon item={item} />
        )}
      </View>
      <Text numberOfLines={1} className="font-instrument-sans flex-1 text-sm" style={{ color: theme.foreground }}>
        {item.title}
      </Text>
      <TimeAgo
        at={item.at}
        className="font-instrument-sans text-xs"
        style={{ color: theme.mutedForeground, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
      />
    </Pressable>
  );
}

/** The web Today PR mark: the review surface's glyph and colour for each state (merged, draft, closed, open). */
function TodayPrIcon({ item }: { item: TodayItem }) {
  const scheme = useScheme();
  const status = item.prState === "draft" || item.prState === undefined ? "open" : item.prState;
  const appearance = prStatusAppearance(status, item.prState === "draft", scheme);
  const Icon = appearance.icon;
  return <Icon size={14} color={appearance.text} accessibilityLabel={`PR: ${appearance.label}`} />;
}

/** While Today loads: one card of rows. */
function TodayPlaceholders() {
  const card = EVA_THEME[useScheme()].card;
  return (
    <SkeletonList
      label="Loading Today"
      count={1}
      divided={false}
      className="px-4 pt-14"
      renderRow={(row) => (
        <View className="rounded-lg" style={{ backgroundColor: card }}>
          <SkeletonRow index={row} lines={1} trailing={false} minHeight={168} className="px-4" />
        </View>
      )}
    />
  );
}
