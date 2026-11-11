import { api } from "@eva/backend";
import { PR_LIST_STATES, type PullRequestListState } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconGitPullRequest } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { Button, EmptyState, SkeletonList, SkeletonRow, Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
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
import { useScheme, XS_TRACKING } from "@/ui/theme";

type PullRequest = FunctionReturnType<typeof api.github.listPullRequests>[number];

const STATE_LABEL: Record<PullRequestListState, string> = { open: "Open", closed: "Closed", all: "All" };

/** The web `text-2xs` (11 / 16, 0.01em). */
const TEXT_2XS = { fontSize: 11, lineHeight: 16, letterSpacing: 0.11 };

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
  const scheme = useScheme();
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
        {/* The web `ReviewsListStateTabs`: a full-width `tabs-segmented` h-8 list. */}
        <Tabs
          value={listState}
          onValueChange={(value: string) => setListState(PR_LIST_STATES.find((option) => option === value) ?? "open")}
        >
          <TabsList
            variant="segmented"
            size="sm"
            className="gap-0 self-stretch p-1"
            style={scheme === "dark" ? { backgroundColor: EVA_THEME.dark.card } : undefined}
          >
            {PR_LIST_STATES.map((value) => (
              <TabsTrigger key={value} value={value} className="flex-1" minHeight={largerText ? undefined : 24}>
                {STATE_LABEL[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
          data={state.data}
          keyExtractor={(pr) => String(pr.number)}
          renderItem={({ item: pr }) => <PullRequestRow pr={pr} repoId={repo._id} />}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
    </View>
  );
}

/** While the pull requests load: rows shaped as `PullRequestRow` (icon and title over the meta line), undivided as the list. */
function PullRequestPlaceholders() {
  return (
    <SkeletonList
      label="Loading pull requests"
      divided={false}
      renderRow={(row) => <SkeletonRow index={row} leading={14} lines={2} minHeight={58} />}
    />
  );
}

/**
 * The web `ReviewsSidebarRow`: the PR icon (emerald when open and ready),
 * the title in medium, then `#N`, the author and the age in `text-2xs` muted.
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
      // Web: `py-2.5` around two lines, `gap-0.5`, the radius of a sidebar link.
      className="gap-0.5 rounded-lg px-2 py-2.5 active:opacity-70"
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
        <Text className="font-instrument-sans" style={{ ...TEXT_2XS, color: theme.mutedForeground }}>
          {`#${pr.number}`}
        </Text>
        {pr.authorLogin ? (
          <Text numberOfLines={1} className="font-instrument-sans min-w-0 shrink" style={{ ...TEXT_2XS, color: theme.mutedForeground }}>
            {pr.authorLogin}
          </Text>
        ) : null}
        <Text
          className="font-instrument-sans ml-auto"
          style={{ ...TEXT_2XS, color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}
        >
          {timeAgo(updatedAt)}
        </Text>
      </View>
    </Pressable>
  );
}
