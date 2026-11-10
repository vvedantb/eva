import { api } from "@eva/backend";
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
} from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MergeAction } from "@/reviews/MergeAction";
import { prStatusAppearance, ToneIcon, toneColour } from "@/reviews/prAppearance";
import { ReviewComposer } from "@/reviews/ReviewComposer";
import { ReviewSummary } from "@/reviews/ReviewSummary";
import { useActionResult } from "@/reviews/useActionResult";
import { type Scheme, useScheme } from "@/ui/theme";

/**
 * One pull request under Reviews (the web `/reviews/$prNumber/summary`), at
 * phone width: the web header (state, `head → base`, the ⋯ menu, the title
 * with its number linking to GitHub, and a blocker line when there is one),
 * then Summary. The web header's Merge and floating composer sit in a bar at
 * the bottom, in thumb reach. The overview is `github.getPullRequestOverview`,
 * read once on open; Refresh and every write read it again past the cache.
 */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ repoId: string; prNumber: string }>();
  const router = useRouter();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const repos = useQuery(api.githubRepos.list, {});
  const getOverview = useAction(api.github.getPullRequestOverview);
  const [composing, setComposing] = useState(false);
  const repo = repos?.find((candidate) => candidate._id === params.repoId);
  const prNumber = Number(params.prNumber);
  const valid = Number.isInteger(prNumber) && prNumber > 0;
  const repoId = repo?._id;
  const { state, reload } = useActionResult(
    repoId !== undefined && valid ? `${repoId}:${prNumber}` : null,
    (force) => (repoId === undefined ? Promise.reject(new Error("Repo not found")) : getOverview({ repoId, prNumber, force })),
    "Couldn't load pull request",
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace("/sessions?section=reviews"));
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

  const overview = state.data;
  const isOpen = overview.status === "open";
  return (
    <View className="flex-1">
      <ReviewHeader overview={overview} refreshing={state.refreshing} onRefresh={reload} onBack={back} scheme={scheme} />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 16 }}>
        <ReviewSummary overview={overview} />
      </ScrollView>
      {/* The web header's Merge and its floating composer, in thumb reach. */}
      <View
        className="flex-row items-center gap-2 px-4 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1, borderColor: tokens.color.border[scheme] }}
      >
        <View className="min-w-0 flex-1">{isOpen ? <MergeAction repoId={repoId} overview={overview} onDone={reload} /> : null}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Comment on pull request"
          onPress={() => setComposing(true)}
          className="size-11 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: EVA_THEME[scheme].secondary }}
        >
          <IconMessage size={18} color={EVA_THEME[scheme].secondaryForeground} />
        </Pressable>
      </View>
      <ReviewComposer
        open={composing}
        onOpenChange={setComposing}
        repoId={repoId}
        prNumber={overview.number}
        isOpen={isOpen}
        onPosted={reload}
      />
    </View>
  );
}

/**
 * The web `ReviewHeader`: Back (phones expect one), the state pill, `head →
 * base` and the ⋯ menu (Refresh, Copy link, View on GitHub; its dots turn into
 * a spinner while a refresh runs); then the title with `#N` linking to
 * GitHub; then the blocker, when there is one worth a line.
 */
function ReviewHeader({
  overview,
  refreshing,
  onRefresh,
  onBack,
  scheme,
}: {
  overview: PrOverview;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  scheme: Scheme;
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
    </View>
  );
}
