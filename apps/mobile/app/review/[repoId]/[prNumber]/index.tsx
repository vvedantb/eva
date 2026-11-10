import { api, type Id } from "@eva/backend";
import { headerBlocker, type PrOverview } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconChevronLeft,
  IconDots,
  IconExternalLink,
  IconLink,
  IconMessage,
  IconRefresh,
} from "@tabler/icons-react-native";
import {
  Button,
  CenteredSpinner,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  HeaderIconButton,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@vvedantb/native-ui/primitives";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { tokens } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DiffOptions } from "@/diff/DiffOptions";
import { usePendingLineComments, usePrDiff } from "@/diff/prDiffStore";
import { MergeAction } from "@/reviews/MergeAction";
import { prStatusAppearance, ToneIcon, toneColour } from "@/reviews/prAppearance";
import { ReviewCode } from "@/reviews/ReviewCode";
import { ReviewComposer, type ComposerMode } from "@/reviews/ReviewComposer";
import { ReviewSummary } from "@/reviews/ReviewSummary";
import { useActionResult } from "@/reviews/useActionResult";
import { type Scheme, useScheme } from "@/ui/theme";

/** The phone's review tabs: the web Summary and Code (Timeline is not on the phone yet). */
type ReviewTab = "summary" | "code";

/**
 * One pull request under Reviews (the web `/reviews/$prNumber/$reviewTab`), at
 * phone width: the web header (state, `head → base`, the ⋯ menu, the title
 * with its number linking to GitHub, a blocker line when there is one, and
 * the tab row), then Summary or Code. The web header's Merge and floating
 * composer sit in a bar at the bottom, in thumb reach. The overview is
 * `github.getPullRequestOverview`, read once on open; Refresh and every write
 * read it again past the cache.
 */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ repoId: string; prNumber: string; tab?: string }>();
  const router = useRouter();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const repos = useQuery(api.githubRepos.list, {});
  const getOverview = useAction(api.github.getPullRequestOverview);
  const repo = repos?.find((candidate) => candidate._id === params.repoId);
  const prNumber = Number(params.prNumber);
  const valid = Number.isInteger(prNumber) && prNumber > 0;
  const repoId = repo?._id;
  const { state, reload } = useActionResult(
    repoId !== undefined && valid ? `${repoId}:${prNumber}` : null,
    (force) => (repoId === undefined ? Promise.reject(new Error("Repo not found")) : getOverview({ repoId, prNumber, force })),
    "Couldn't load pull request",
  );
  // After a deep link, Back opens the Reviews list.
  const back = () => goBackOrReplace(router, "/sessions?section=reviews");
  const bare = (body: ReactNode) => (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row px-3 pb-2">
        <HeaderIconButton label="Back" onPress={back}>
          <IconChevronLeft size={20} color={tokens.color.foreground[scheme]} />
        </HeaderIconButton>
      </View>
      {body}
    </View>
  );

  if (repos !== undefined && (repo === undefined || !valid)) {
    return bare(<EmptyState icon={IconAlertTriangle} title="Pull request not found" description="It was deleted, or you no longer have access." />);
  }
  if (state.status === "loading" || repoId === undefined) return bare(<CenteredSpinner label="Loading pull request…" />);
  if (state.status === "error") {
    return bare(
      <EmptyState
        icon={IconAlertTriangle}
        title={state.message}
        action={
          <Button size="sm" variant="secondary" fullWidth={false} onPress={reload}>
            Retry
          </Button>
        }
      />,
    );
  }

  return (
    <ReviewTabs
      repoId={repoId}
      overview={state.data}
      tab={params.tab === "code" ? "code" : "summary"}
      onTabChange={(tab) => router.setParams({ tab })}
      refreshing={state.refreshing}
      onRefresh={reload}
      onBack={back}
    />
  );
}

/**
 * The loaded pull request: the header with the tab row, both tabs, and the
 * bottom bar. The tab is a route param set in place (`setParams`), so a switch
 * adds no history and Back still leaves the pull request. Code mounts on its
 * first visit, so reading Summary does not download the diff, and then stays
 * mounted with its scroll, as the web keeps every tab mounted.
 */
function ReviewTabs({
  repoId,
  overview,
  tab,
  onTabChange,
  refreshing,
  onRefresh,
  onBack,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  tab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const pr = { repoId, prNumber: overview.number };
  const [codeVisited, setCodeVisited] = useState(tab === "code");
  const [composing, setComposing] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("comment");
  const codeMounted = codeVisited || tab === "code";
  const diff = usePrDiff(codeMounted ? pr : null);
  const pending = usePendingLineComments(pr).comments.length;
  const isOpen = overview.status === "open";

  const nav = (
    // 44 high on both tabs, so Code's ⋯ does not move the content when it shows.
    <View className="min-h-11 flex-row items-center gap-2 px-1">
      <Tabs
        value={tab}
        onValueChange={(value: string) => {
          const next = value === "code" ? "code" : "summary";
          if (next === "code") setCodeVisited(true);
          onTabChange(next);
        }}
      >
        <TabsList size="sm" className="self-start">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* Code's controls, at the tab row's right end as on the web. */}
      <View className="ml-auto">
        {tab === "code" ? (
          <DiffOptions pr={pr} refreshing={diff.state.status === "ready" && diff.state.refreshing} onRefresh={diff.reload} />
        ) : null}
      </View>
    </View>
  );

  return (
    <View className="flex-1">
      <ReviewHeader overview={overview} refreshing={refreshing} onRefresh={onRefresh} onBack={onBack} scheme={scheme} nav={nav} />
      <ScrollView className="flex-1" style={tab === "summary" ? undefined : HIDDEN} contentContainerStyle={{ paddingBottom: 16 }}>
        <ReviewSummary overview={overview} />
      </ScrollView>
      {codeMounted ? (
        <View className="flex-1" style={tab === "code" ? undefined : HIDDEN}>
          <ReviewCode
            pr={pr}
            state={diff.state}
            onOpenFile={(path) =>
              router.push({
                pathname: "/review/[repoId]/[prNumber]/file",
                params: { repoId, prNumber: String(overview.number), path },
              })
            }
          />
        </View>
      ) : null}
      {/* The web header's Merge and its floating composer, in thumb reach. */}
      <View
        className="flex-row items-center gap-2 px-4 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1, borderColor: tokens.color.border[scheme] }}
      >
        <View className="min-w-0 flex-1">{isOpen ? <MergeAction repoId={repoId} overview={overview} onDone={onRefresh} /> : null}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            pending > 0 ? `Review pull request, ${pending} ${pending === 1 ? "comment" : "comments"} pending` : "Comment on pull request"
          }
          onPress={() => {
            // As the web composer: pending line comments open it on Review.
            setComposerMode(pending > 0 ? "review" : "comment");
            setComposing(true);
          }}
          className="size-11 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: EVA_THEME[scheme].secondary }}
        >
          <IconMessage size={18} color={EVA_THEME[scheme].secondaryForeground} />
          {pending > 0 ? (
            <View
              className="absolute -top-1 -right-1 h-4 min-w-4 items-center justify-center rounded-full px-1"
              style={{ backgroundColor: EVA_THEME[scheme].primary }}
            >
              <Text className="font-instrument-sans-semibold" style={{ fontSize: 10, lineHeight: 12, fontWeight: "600", color: EVA_THEME[scheme].primaryForeground, fontVariant: ["tabular-nums"] }}>
                {pending}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <ReviewComposer
        open={composing}
        onOpenChange={setComposing}
        mode={composerMode}
        onModeChange={setComposerMode}
        repoId={repoId}
        prNumber={overview.number}
        isOpen={isOpen}
        onPosted={onRefresh}
      />
    </View>
  );
}

/** A tab kept mounted while another shows. */
const HIDDEN: ViewStyle = { display: "none" };

/**
 * The web `ReviewHeader`: Back (phones expect one), the state pill, `head →
 * base` and the ⋯ menu (Refresh, Copy link, View on GitHub; its dots turn into
 * a spinner while a refresh runs); then the title with `#N` linking to
 * GitHub; then the blocker, when there is one worth a line; then the tabs.
 */
function ReviewHeader({
  overview,
  refreshing,
  onRefresh,
  onBack,
  scheme,
  nav,
}: {
  overview: PrOverview;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  scheme: Scheme;
  /** The tab row, last, as the web header ends in its tabs. */
  nav: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[scheme];
  const state = prStatusAppearance(overview.status, overview.draft, scheme);
  const StateIcon = state.icon;
  const blocker = headerBlocker(overview);
  const copyLink = () =>
    void Clipboard.setStringAsync(overview.htmlUrl).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy the link"),
    );

  return (
    <View className="gap-2 px-3 pb-3" style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderColor: tokens.color.border[scheme] }}>
      <View className="flex-row items-center gap-2">
        <HeaderIconButton label="Back" onPress={onBack}>
          <IconChevronLeft size={20} color={theme.foreground} />
        </HeaderIconButton>
        <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: state.fill }}>
          <StateIcon size={14} color={state.text} />
          <Text className="font-instrument-sans-medium text-sm" style={{ color: state.text, fontWeight: "500" }}>
            {state.label}
          </Text>
        </View>
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5" accessible accessibilityLabel={`${overview.headRef} merges into ${overview.baseRef}`}>
          <Text numberOfLines={1} className="font-instrument-sans min-w-0 shrink text-sm" style={{ color: theme.mutedForeground }}>
            {overview.headRef}
          </Text>
          <IconArrowNarrowRight size={14} color={theme.mutedForeground} />
          {/* The web keeps the base whole; a phone row cannot, so a long base truncates too. */}
          <Text numberOfLines={1} className="font-instrument-sans min-w-0 shrink text-sm" style={{ color: theme.mutedForeground, maxWidth: "50%" }}>
            {overview.baseRef}
          </Text>
        </View>
        <DropdownMenu>
          <DropdownMenuTrigger
            accessibilityLabel={refreshing ? "Refreshing pull request" : "More pull request actions"}
            hitSlop={4}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: tokens.color.surfaceSecondary[scheme] }}
          >
            {refreshing ? <Spinner size="sm" decorative /> : <IconDots size={18} color={theme.foreground} />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem icon={IconRefresh} disabled={refreshing} onSelect={onRefresh}>
              Refresh
            </DropdownMenuItem>
            <DropdownMenuItem icon={IconLink} onSelect={copyLink}>
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem icon={IconExternalLink} onSelect={() => void Linking.openURL(overview.htmlUrl)}>
              View on GitHub
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
      <Text accessibilityRole="header" className="font-instrument-sans-medium px-1 text-lg" style={{ color: theme.foreground, fontWeight: "500" }}>
        {`${overview.title} `}
        <Text
          accessibilityRole="link"
          accessibilityLabel={`Pull request #${overview.number} on GitHub`}
          onPress={() => void Linking.openURL(overview.htmlUrl)}
          className="font-instrument-sans"
          style={{ color: theme.mutedForeground, fontWeight: "400" }}
        >
          {`#${overview.number} ↗`}
        </Text>
      </Text>
      {blocker === null ? null : (
        <View className="flex-row items-center gap-1.5 px-1">
          <ToneIcon tone={blocker.tone} scheme={scheme} size={13} />
          <Text className="font-instrument-sans-medium text-xs" style={{ color: toneColour(blocker.tone, scheme), fontWeight: "500" }}>
            {blocker.label}
          </Text>
        </View>
      )}
      {nav}
    </View>
  );
}
