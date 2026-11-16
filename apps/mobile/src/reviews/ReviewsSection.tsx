import { api } from "@eva/backend";
import { PR_LIST_STATES, type PullRequestListState } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconGitPullRequest } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { Button, EmptyState, ListDivider, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { prListIconColour } from "@/reviews/prAppearance";
import { useActionResult } from "@/reviews/useActionResult";
import { timeAgo } from "@/ui/format";
import { RepoPicker, useRepoParam } from "@/ui/RepoPicker";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

type PullRequest = FunctionReturnType<typeof api.github.listPullRequests>[number];

const STATE_LABEL: Record<PullRequestListState, string> = { open: "Open", closed: "Closed", all: "All" };

/** The meta line: the Inbox row's `text-xs` (12 / 16), not the web sidebar's 11. */
const META_TEXT = { fontSize: 12, lineHeight: 16, letterSpacing: XS_TRACKING };

/**
 * The web Reviews sidebar at phone width, for one repo: the repo picker (the
 * web reads the repo from its path), the Open / Closed / All switch, then the
 * repo's GitHub pull requests, recently updated first (`github.listPullRequests`,
 * every page of them, so a `FlatList`). A tap opens the review screen. The web hover prefetch and the "open
 * PRs on GitHub" click setting are not on the phone; the right-click Rename is in the review screen's ⋯ menu.
 */
export function ReviewsSection() {
  const { repos, repo, setRepo } = useRepoParam();
  const listPullRequests = useAction(api.github.listPullRequests);
  const [listState, setListState] = useState<PullRequestListState>("open");
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const repoId = repo?._id;
  const { state, reload } = useActionResult(
    repoId === undefined ? null : `${repoId}:${listState}`,
    () => (repoId === undefined ? Promise.resolve([]) : listPullRequests({ repoId, state: listState })),
    "Couldn't load pull requests",
  );

  if (repos === undefined) return <PullRequestPlaceholders />;
  if (!repo) {
    return <EmptyState icon={IconGitPullRequest} title="No repos" description="Connect a repo on the web. It shows up here." />;
  }

  return (
    <View className="flex-1">
      <View className="px-4">
        <RepoPicker repos={repos} value={repo} onChange={setRepo} />
      </View>
      <View className="px-4 pb-2">
        {/* The web `ReviewsListStateTabs`. */}
        <SegmentedTabs
          value={listState}
          options={PR_LIST_STATES.map((value) => ({ value, label: STATE_LABEL[value] }))}
          onChange={setListState}
        />
      </View>
      {state.status === "loading" ? (
        <PullRequestPlaceholders />
      ) : state.status === "error" ? (
        <EmptyState
          icon={IconGitPullRequest}
          title={state.message}
          action={
            <Button size="sm" variant="secondary" fullWidth={false} onPress={reload}>
              Retry
            </Button>
          }
        />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={IconGitPullRequest}
          title={`No ${listState === "all" ? "" : `${listState} `}pull requests`}
        />
      ) : (
        <FlatList
          {...LIST_WINDOW}
          data={state.data}
          keyExtractor={(pr) => String(pr.number)}
          ItemSeparatorComponent={ListDivider}
          renderItem={({ item: pr }) => <PullRequestRow pr={pr} repoId={repo._id} />}
          contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
    </View>
  );
}

/** While the pull requests load: rows shaped as `PullRequestRow` (icon and title over the meta line), divided as the list. */
function PullRequestPlaceholders() {
  return (
    <SkeletonList
      label="Loading pull requests"
      renderRow={(row) => <SkeletonRow index={row} leading={14} lines={2} minHeight={64} />}
    />
  );
}

/**
 * The web `ReviewsSidebarRow` at the Inbox row's size, for a thumb: the PR
 * icon (emerald when open and ready), the 14 title in medium, then `#N`, the
 * author and the age in the Inbox `text-xs` muted; 64 high, divided. The web
 * sidebar's 58 rows with an 11 meta line, flush in a column, were a mouse's density.
 */
function PullRequestRow({ pr, repoId }: { pr: PullRequest; repoId: string }) {
  const router = useRouter();
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const updatedAt = new Date(pr.updatedAt).getTime();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`#${pr.number} ${pr.title}`}
      onPress={() =>
        router.push({ pathname: "/review/[repoId]/[prNumber]", params: { repoId, prNumber: String(pr.number) } })
      }
      className="min-h-16 justify-center gap-0.5 px-4 py-3 active:opacity-70"
    >
      <View className="flex-row items-center gap-1.5">
        <IconGitPullRequest size={14} color={prListIconColour(pr, scheme)} />
        <Text
          numberOfLines={1}
          className="font-instrument-sans-medium min-w-0 flex-1 text-sm"
          style={{ color: theme.foreground, fontWeight: "500", letterSpacing: XS_TRACKING }}
        >
          {pr.title}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5 pl-5">
        <Text className="font-instrument-sans" style={{ ...META_TEXT, color: theme.mutedForeground }}>
          {`#${pr.number}`}
        </Text>
        {pr.authorLogin ? (
          <Text numberOfLines={1} className="font-instrument-sans min-w-0 shrink" style={{ ...META_TEXT, color: theme.mutedForeground }}>
            {pr.authorLogin}
          </Text>
        ) : null}
        <Text
          className="font-instrument-sans ml-auto"
          style={{ ...META_TEXT, color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}
        >
          {timeAgo(updatedAt)}
        </Text>
      </View>
    </Pressable>
  );
}
