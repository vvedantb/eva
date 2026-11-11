import { api, type Doc, type Id } from "@eva/backend";
import { githubPrUrl, headerBlocker, type PrOverview } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconArrowUpRight,
  IconChevronLeft,
  IconDots,
  IconExternalLink,
  IconGitPullRequestClosed,
  IconLink,
  IconMessage,
  IconPencil,
  IconRefresh,
  IconStack2,
} from "@tabler/icons-react-native";
import {
  Button,
  CenteredSpinner,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  HeaderIconButton,
  Pager,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@vvedantb/native-ui/primitives";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { tokens, useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DiffOptions } from "@/diff/DiffOptions";
import { usePendingLineComments, usePrDiff } from "@/diff/prDiffStore";
import { prStatusAppearance, ToneIcon, toneColour } from "@/reviews/prAppearance";
import { RenameDialog } from "@/reviews/PrMetaEdit";
import { PrPrimaryAction } from "@/reviews/PrPrimaryAction";
import { ReviewCode } from "@/reviews/ReviewCode";
import { ReviewComposer, type ComposerMode } from "@/reviews/ReviewComposer";
import { ReviewSummary } from "@/reviews/ReviewSummary";
import { ReviewTimeline } from "@/reviews/ReviewTimeline";
import { useActionResult } from "@/reviews/useActionResult";
import { useStartReviewSession } from "@/reviews/useStartReviewSession";
import { type Scheme, useScheme } from "@/ui/theme";

/** The web review tabs, in its order: Summary, Timeline, Code. */
const REVIEW_TABS = ["summary", "timeline", "code"] as const;
type ReviewTab = (typeof REVIEW_TABS)[number];
const TAB_LABEL: Record<ReviewTab, string> = { summary: "Summary", timeline: "Timeline", code: "Code" };

/**
 * One pull request under Reviews (the web `/reviews/$prNumber/$reviewTab`), at
 * phone width: the web header (state, `head → base`, the ⋯ menu, the title
 * with its number linking to GitHub, a blocker line when there is one, and
 * the tab row), then Summary, Timeline or Code. The web header's Merge and floating
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
  const tab = REVIEW_TABS.find((candidate) => candidate === params.tab) ?? "summary";
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
  if (state.status === "loading" || repo === undefined) return bare(<CenteredSpinner label="Loading pull request…" />);
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
      repo={repo}
      overview={state.data}
      tab={tab}
      onTabChange={(tab) => router.setParams({ tab })}
      refreshing={state.refreshing}
      onRefresh={reload}
      onBack={back}
    />
  );
}

/**
 * The loaded pull request: the header with the tab row, the tabs on a `Pager`
 * (a sideways swipe moves between them, as Sessions and Projects; the tab
 * fill follows the pages), and the bottom bar. The tab is a route param set
 * in place (`setParams`), so a switch adds no history and Back still leaves
 * the pull request. A tab mounts once visited or swiped toward, and then
 * stays mounted with its scroll, as the web keeps every tab mounted; the diff
 * downloads only once Code is visited, so reading Summary does not fetch it.
 */
function ReviewTabs({
  repo,
  overview,
  tab,
  onTabChange,
  refreshing,
  onRefresh,
  onBack,
}: {
  repo: Doc<"githubRepos">;
  overview: PrOverview;
  tab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const repoId = repo._id;
  const pr = { repoId, prNumber: overview.number };
  const [visited, setVisited] = useState<ReadonlySet<ReviewTab>>(new Set([tab]));
  const [composing, setComposing] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("comment");
  const index = Math.max(0, REVIEW_TABS.indexOf(tab));
  const progress = useSharedValue(index);
  const diff = usePrDiff(visited.has("code") || tab === "code" ? pr : null);
  const pending = usePendingLineComments(pr).comments.length;
  const isOpen = overview.status === "open";
  const select = (next: ReviewTab) => {
    if (!visited.has(next)) setVisited(new Set([...visited, next]));
    onTabChange(next);
  };

  const nav = (
    // As high as Code's ⋯ (a `HeaderIconButton`, 48; 56 with larger text) on
    // every tab, so the tabs and the content do not move when it shows.
    <View className={`${largerText ? "min-h-14" : "min-h-12"} flex-row items-center gap-2 px-1`}>
      <Tabs value={tab} onValueChange={(value: string) => select(REVIEW_TABS.find((candidate) => candidate === value) ?? "summary")}>
        <TabsList size="sm" className="self-start" progress={progress}>
          {REVIEW_TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {TAB_LABEL[value]}
            </TabsTrigger>
          ))}
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
      <ReviewHeader repoId={repoId} overview={overview} refreshing={refreshing} onRefresh={onRefresh} onBack={onBack} scheme={scheme} nav={nav} />
      <Pager
        index={index}
        count={REVIEW_TABS.length}
        progress={progress}
        onIndexChange={(page) => select(REVIEW_TABS[page] ?? "summary")}
        renderPage={(page) => {
          switch (REVIEW_TABS[page]) {
            case "timeline":
              return <ReviewTimeline repoId={repoId} overview={overview} />;
            case "code":
              return (
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
              );
            default:
              return (
                <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
                  <ReviewSummary
                    repoId={repoId}
                    overview={overview}
                    prUrl={githubPrUrl(repo.owner, repo.name, overview.number)}
                    defaultModel={repo.defaultModel}
                    onChanged={onRefresh}
                  />
                </ScrollView>
              );
          }
        }}
      />
      {/* The web header's Merge and its floating composer, in thumb reach. */}
      <View
        className="flex-row items-center gap-2 px-4 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1, borderColor: tokens.color.border[scheme] }}
      >
        <View className="min-w-0 flex-1">
          <PrPrimaryAction repoId={repoId} overview={overview} onDone={onRefresh} />
        </View>
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

/**
 * The web `ReviewHeader`: Back (phones expect one), the state pill, `head →
 * base` and the ⋯ menu (Refresh, Copy link, View on GitHub, Rename; on an
 * open pull request Stack a new session and Close without merging, behind
 * the web confirm; its dots turn into a spinner while a refresh or a close
 * runs); then the title with `#N` linking to GitHub; then the blocker, when
 * there is one worth a line, with its fix (a session on the head branch, as
 * the web `PrRemedyButton`, no confirm); then the tabs. Rename sits in this
 * menu (chose: the web has it on the Reviews list row's menu).
 */
function ReviewHeader({
  repoId,
  overview,
  refreshing,
  onRefresh,
  onBack,
  scheme,
  nav,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  refreshing: boolean;
  /** Reads the overview again: Refresh, and after a close or a rename. */
  onRefresh: () => void;
  onBack: () => void;
  scheme: Scheme;
  /** The tab row, last, as the web header ends in its tabs. */
  nav: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = EVA_THEME[scheme];
  const update = useAction(api.github.updatePullRequest);
  const remedySession = useStartReviewSession(repoId);
  const [renaming, setRenaming] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const isOpen = overview.status === "open";
  const close = () => {
    setClosing(true);
    update({ repoId, prNumber: overview.number, state: "closed" }).then(
      () => {
        setClosing(false);
        setConfirmingClose(false);
        toast.success(`Pull request #${overview.number} closed`);
        onRefresh();
      },
      (cause: Error) => {
        setClosing(false);
        toast.error(cause.message || "Could not close the branch");
      },
    );
  };
  // The web `useStackNewSession`: the new-session screen on this repo, from the head branch.
  const stackNewSession = () =>
    router.push({
      pathname: "/session/new",
      params: { repo: repoId, stackOn: String(overview.number), stackBase: overview.headRef },
    });
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
          {/* The head gives up its width first, so the base stays whole, as the web;
              only a base past half the row truncates. */}
          <Text numberOfLines={1} className="font-instrument-sans shrink-0 text-sm" style={{ color: theme.mutedForeground, maxWidth: "50%" }}>
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
            {refreshing || closing ? <Spinner size="sm" decorative /> : <IconDots size={18} color={theme.foreground} />}
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
            <DropdownMenuItem icon={IconPencil} onSelect={() => setRenaming(true)}>
              Rename
            </DropdownMenuItem>
            {isOpen ? (
              <>
                <DropdownMenuItem icon={IconStack2} onSelect={stackNewSession}>
                  Stack a new session
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Closing notifies every reviewer and stops CI, so it asks first, as the web. */}
                <DropdownMenuItem icon={IconGitPullRequestClosed} destructive disabled={closing} onSelect={() => setConfirmingClose(true)}>
                  Close without merging
                </DropdownMenuItem>
              </>
            ) : null}
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
        // 44 high when it holds the fix, so the fix is a whole target without slop over the title or the tabs.
        <View className={blocker.remedy === null ? "flex-row items-center gap-1.5 px-1" : "min-h-11 flex-row items-center gap-1.5 px-1"}>
          <ToneIcon tone={blocker.tone} scheme={scheme} size={13} />
          <Text className="font-instrument-sans-medium min-w-0 shrink text-xs" style={{ color: toneColour(blocker.tone, scheme), fontWeight: "500" }}>
            {blocker.label}
          </Text>
          {blocker.remedy === null ? null : (
            <RemedyLink
              label={blocker.remedy.action}
              colour={blocker.tone === "failure" || blocker.tone === "success" ? toneColour(blocker.tone, scheme) : theme.mutedForeground}
              starting={remedySession.starting}
              onPress={() => {
                if (blocker.remedy !== null) {
                  remedySession.start({ title: blocker.remedy.sessionTitle, message: blocker.remedy.prompt, baseBranch: overview.headRef });
                }
              }}
            />
          )}
        </View>
      )}
      {nav}
      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        repoId={repoId}
        prNumber={overview.number}
        title={overview.title}
        onSaved={onRefresh}
      />
      <Dialog
        open={confirmingClose}
        onOpenChange={(open) => {
          // Closing mid-request would hide the only progress the user sees.
          if (!closing) setConfirmingClose(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Close pull request #${overview.number} without merging?`}</DialogTitle>
            <DialogDescription>Reviewers are notified and CI stops. You can reopen it later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={closing} onPress={() => setConfirmingClose(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={closing}
              disabled={closing}
              leftIcon={<IconGitPullRequestClosed size={16} color={theme.destructiveForeground} />}
              onPress={close}
            >
              {closing ? "Closing" : "Close pull request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </View>
  );
}

/**
 * The web `PrRemedyButton`: the blocker's fix as a link in the blocker's own
 * colour at the line's end (a session on the head branch with the fix asked
 * for). It fills the 44 high line and pads its width to 44 or more.
 */
function RemedyLink({ label, colour, starting, onPress }: { label: string; colour: string; starting: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Starts a session that fixes it"
      accessibilityState={{ busy: starting, disabled: starting }}
      disabled={starting}
      onPress={onPress}
      className="ml-auto min-h-11 min-w-11 flex-row items-center gap-1 self-stretch pl-2 active:opacity-70"
      style={{ opacity: starting ? 0.7 : 1 }}
    >
      <Text className="font-instrument-sans-medium text-xs" style={{ color: colour, fontWeight: "500" }}>
        {label}
      </Text>
      {starting ? <Spinner size="sm" decorative /> : <IconArrowUpRight size={13} color={colour} />}
    </Pressable>
  );
}
