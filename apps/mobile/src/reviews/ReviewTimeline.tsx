import { api, type Id } from "@eva/backend";
import {
  buildPrTimeline,
  buildSummaryComments,
  groupTimelineRows,
  reviewStateMeta,
  type ConversationEvent,
  type PrOverview,
  type SummaryComment,
  type TimelineRow,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconChevronDown,
  IconGitCommit,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconMessage,
  IconMessageCircle,
  type IconProps,
} from "@tabler/icons-react-native";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Button } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ComponentType, type ReactNode } from "react";
import { FlatList, Linking, Pressable, Text, View } from "react-native";
import { prStatusAppearance, ToneIcon } from "@/reviews/prAppearance";
import { CommentCard, PrAvatar, TEXT_SM, TEXT_XS } from "@/reviews/ReviewSummary";
import { timeAgo } from "@/ui/format";
import { type Scheme, useScheme } from "@/ui/theme";

/** The full commit list, read on demand (the web `usePrCommits`). */
type CommitsLoad =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: FunctionReturnType<typeof api.github.getPullRequestCommits> };

/** The web rail's gutter: a 32 marker column, then 16 to the row's text (`pl-12`). */
const GUTTER = 32;

/**
 * A row's least height: the two-line list row a thumb taps (the Inbox 64),
 * where the web rail packs its rows to fit their text. The marker sits on its centre.
 */
const ROW_HEIGHT = 64;

/**
 * The web Timeline tab at phone width: one rail down the left and every event
 * a row on it, newest first (the opening, each push, each verdict, the merge),
 * each run of remarks folded into one conversation row that opens in place.
 * The events and their order are the shared `buildPrTimeline` and
 * `groupTimelineRows`, so the phone and the web cannot disagree. A virtualised
 * list, as a long branch passes 50 rows. A commit row opens the commit on
 * GitHub: the phone Code tab has no commit scope, where the web one opens on
 * that commit.
 */
export function ReviewTimeline({ repoId, overview }: { repoId: Id<"githubRepos">; overview: PrOverview }) {
  const scheme = useScheme();
  const getCommits = useAction(api.github.getPullRequestCommits);
  // The overview carries GitHub's first page of commits, the oldest; Load more reads the rest.
  const [all, setAll] = useState<CommitsLoad>({ status: "idle" });
  const commits = all.status === "ready" ? all.data.commits : overview.commits;
  const rows = groupTimelineRows([...buildPrTimeline({ ...overview, commits })].reverse());
  const comments = new Map(buildSummaryComments(overview).map((comment) => [comment.key, comment]));
  const hiddenCommits = Math.max(0, overview.commitCount - commits.length);
  const theme = EVA_THEME[scheme];

  const load = () => {
    setAll({ status: "loading" });
    getCommits({ repoId, prNumber: overview.number }).then(
      (data) => setAll({ status: "ready", data }),
      (cause: Error) => setAll({ status: "error", message: cause.message || "Couldn't load commits" }),
    );
  };

  const header =
    all.status !== "ready" && hiddenCommits > 0 ? (
      <View className="mb-5 gap-2 rounded-md px-3 py-2" style={{ marginLeft: GUTTER + 16, backgroundColor: withAlpha(theme.muted, 0.5) }}>
        <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>
          {`${hiddenCommits} more recent ${hiddenCommits === 1 ? "commit is" : "commits are"} not shown.`}
        </Text>
        <Button size="sm" variant="secondary" fullWidth={false} loading={all.status === "loading"} disabled={all.status === "loading"} onPress={load}>
          Load more commits
        </Button>
        {all.status === "error" ? (
          <Text accessibilityRole="alert" style={[TEXT_XS, { color: theme.destructive }]}>
            {all.message}
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View className="items-center gap-2 py-16">
          <IconGitPullRequest size={20} color={theme.mutedForeground} />
          <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>No activity yet.</Text>
        </View>
      }
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 }}
      renderItem={({ item, index }) => (
        <Rail last={index === rows.length - 1} scheme={scheme}>
          <TimelineRowView row={item} overview={overview} comments={comments} scheme={scheme} />
        </Rail>
      )}
    />
  );
}

/** The web rail: a 1 px line through the gutter, broken by each row's marker; it stops at the last row. 8 between rows. */
function Rail({ last, scheme, children }: { last: boolean; scheme: Scheme; children: ReactNode }) {
  return (
    <View className="pb-2">
      <View
        className="absolute"
        style={{ left: GUTTER / 2 - 0.5, top: 0, bottom: last ? undefined : 0, height: last ? ROW_HEIGHT / 2 : undefined, width: 1, backgroundColor: EVA_THEME[scheme].border }}
      />
      {children}
    </View>
  );
}

function TimelineRowView({
  row,
  overview,
  comments,
  scheme,
}: {
  row: TimelineRow;
  overview: PrOverview;
  comments: ReadonlyMap<string, SummaryComment>;
  scheme: Scheme;
}) {
  if (row.kind === "conversation") return <Conversation events={row.events} comments={comments} scheme={scheme} />;
  const { event } = row;
  if (event.kind === "commit") return <CommitRow commit={event.commit} scheme={scheme} />;
  if (event.kind === "verdict") return <VerdictRow review={event.review} stale={event.stale} scheme={scheme} />;
  return (
    <LifecycleRow
      kind={event.kind}
      at={event.at}
      actor={event.kind === "opened" ? overview.authorLogin : event.actor}
      overview={overview}
      scheme={scheme}
    />
  );
}

/** The marker on the rail: the canvas colour masks the line behind it. */
function Marker({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return (
    <View className="items-center justify-center" style={{ width: GUTTER, height: GUTTER, backgroundColor: EVA_THEME[scheme].background }}>
      {children}
    </View>
  );
}

function IconMarker({ icon: Icon, color, scheme }: { icon: ComponentType<IconProps>; color: string; scheme: Scheme }) {
  return (
    <Marker scheme={scheme}>
      <Icon size={14} color={color} />
    </Marker>
  );
}

/** A row: the marker in the gutter, then the text, 16 to its right, at least `ROW_HEIGHT`. */
function Row({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-4" style={{ minHeight: ROW_HEIGHT }}>
      {marker}
      <View className="min-w-0 flex-1 py-2">{children}</View>
    </View>
  );
}

function When({ at, scheme }: { at: number | string | null; scheme: Scheme }) {
  if (at === null || at === 0) return null;
  return <Text style={[TEXT_XS, { color: EVA_THEME[scheme].mutedForeground }]}>{timeAgo(typeof at === "number" ? at : new Date(at).getTime())}</Text>;
}

/** A push: the headline, the short sha, the author and when. A tap opens it on GitHub. */
function CommitRow({ commit, scheme }: { commit: PrOverview["commits"][number]; scheme: Scheme }) {
  const theme = EVA_THEME[scheme];
  const sha = commit.sha.slice(0, 7);
  const headline = commit.message.split("\n")[0] ?? commit.message;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Commit ${sha}: ${headline}. Open on GitHub`}
      onPress={() => void Linking.openURL(commit.htmlUrl)}
      className="active:opacity-70"
    >
      <Row
        marker={
          commit.authorLogin === null && commit.authorAvatarUrl === null ? (
            <IconMarker icon={IconGitCommit} color={theme.mutedForeground} scheme={scheme} />
          ) : (
            <Marker scheme={scheme}>
              <PrAvatar login={commit.authorLogin} avatarUrl={commit.authorAvatarUrl} size={28} />
            </Marker>
          )
        }
      >
        <Text numberOfLines={1} className="font-instrument-sans-semibold" style={[TEXT_SM, { color: theme.foreground, fontWeight: "600" }]}>
          {headline}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
          <Text style={[TEXT_XS, { color: theme.mutedForeground, fontFamily: "monospace" }]}>{sha}</Text>
          {commit.authorLogin === null ? null : <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>{commit.authorLogin}</Text>}
          <When at={commit.committedAt} scheme={scheme} />
        </View>
      </Row>
    </Pressable>
  );
}

/**
 * A run of remarks folded behind one row naming how many, from how many
 * authors and when; the first author's face fades while folded, as the web.
 */
function Conversation({
  events,
  comments,
  scheme,
}: {
  events: readonly ConversationEvent[];
  comments: ReadonlyMap<string, SummaryComment>;
  scheme: Scheme;
}) {
  const [open, setOpen] = useState(false);
  const theme = EVA_THEME[scheme];
  const authors = [
    ...new Map(
      events.map((event) => {
        const author = event.kind === "comment" ? event.comment : event.review;
        return [author.authorLogin, { login: author.authorLogin, avatarUrl: author.authorAvatarUrl }];
      }),
    ).values(),
  ];
  const first = authors[0];
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${events.length} ${events.length === 1 ? "comment" : "comments"}`}
        onPress={() => setOpen(!open)}
        className="flex-row items-center gap-4 active:opacity-70"
        style={{ minHeight: ROW_HEIGHT }}
      >
        {first === undefined ? (
          <IconMarker icon={IconMessage} color={theme.mutedForeground} scheme={scheme} />
        ) : (
          <Marker scheme={scheme}>
            <View style={{ opacity: open ? 1 : 0.45 }}>
              <PrAvatar login={first.login} avatarUrl={first.avatarUrl} size={28} />
            </View>
          </Marker>
        )}
        <View className="min-w-0 flex-1 py-2" style={{ opacity: open ? 1 : 0.6 }}>
          <Text className="font-instrument-sans-semibold" style={[TEXT_SM, { color: open ? theme.foreground : theme.mutedForeground, fontWeight: "600" }]}>
            {`${events.length} ${events.length === 1 ? "comment" : "comments"}`}
          </Text>
          <View className="flex-row gap-1">
            <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>{`${authors.length} ${authors.length === 1 ? "author" : "authors"}`}</Text>
            <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>·</Text>
            <When at={events[0]?.at ?? null} scheme={scheme} />
          </View>
        </View>
        <View style={open ? { transform: [{ rotate: "180deg" }] } : undefined}>
          <IconChevronDown size={14} color={theme.mutedForeground} />
        </View>
      </Pressable>
      {open ? (
        <View className="mt-1 gap-1" style={{ marginLeft: GUTTER + 16 }}>
          {events.map((event) => {
            const comment = comments.get(event.key);
            return comment === undefined ? null : <CommentCard key={event.key} comment={comment} scheme={scheme} framed={false} />;
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Sentence form of a verdict, so the rail reads as prose. */
function verdictAction(state: string): string {
  if (state === "APPROVED") return "approved these changes";
  if (state === "CHANGES_REQUESTED") return "requested changes";
  return "had a review dismissed";
}

/**
 * A verdict: the reviewer's face with the verdict's glyph pinned to it, the
 * sentence and when, then the summary. The web links the login to GitHub; a
 * login is no thumb target, so the face, sentence and time are one 44 high
 * link, as a commit row, and the summary sits under it.
 */
function VerdictRow({ review, stale, scheme }: { review: PrOverview["reviewEvents"][number]; stale: boolean; scheme: Scheme }) {
  const theme = EVA_THEME[scheme];
  return (
    <View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${review.authorLogin} ${verdictAction(review.state)}. Open on GitHub`}
        onPress={() => void Linking.openURL(review.htmlUrl)}
        className="active:opacity-70"
      >
        <Row
          marker={
            <Marker scheme={scheme}>
              <View style={{ opacity: stale ? 0.6 : 1 }}>
                <PrAvatar login={review.authorLogin} avatarUrl={review.authorAvatarUrl} size={28} />
              </View>
              <View className="absolute size-4 items-center justify-center rounded-full" style={{ right: 0, bottom: 0, backgroundColor: theme.background }}>
                {review.state === "COMMENTED" ? (
                  <IconMessageCircle size={14} color={theme.mutedForeground} />
                ) : (
                  <ToneIcon tone={reviewStateMeta(review.state).tone} scheme={scheme} />
                )}
              </View>
            </Marker>
          }
        >
          <View className="flex-row flex-wrap items-center gap-x-1.5">
            <Text className="font-instrument-sans-semibold" style={[TEXT_SM, { color: theme.foreground, fontWeight: "600" }]}>
              {review.authorLogin}
            </Text>
            <Text style={[TEXT_SM, { color: theme.mutedForeground }]}>{verdictAction(review.state)}</Text>
          </View>
          <View className="mt-0.5 flex-row items-center gap-2">
            <When at={review.submittedAt} scheme={scheme} />
            {stale ? <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>· before the latest push</Text> : null}
          </View>
        </Row>
      </Pressable>
      {review.body.trim().length > 0 ? (
        <View className="mt-2" style={{ marginLeft: GUTTER + 16 }}>
          <Markdown>{review.body}</Markdown>
        </View>
      ) : null}
    </View>
  );
}

const LIFECYCLE = {
  opened: { icon: IconGitPullRequest, label: "opened this pull request" },
  merged: { icon: IconGitMerge, label: "merged this pull request" },
  closed: { icon: IconGitPullRequestClosed, label: "closed this pull request" },
} as const;

/** The opening, the merge (in the merged violet) or the close (in red). */
function LifecycleRow({
  kind,
  at,
  actor,
  overview,
  scheme,
}: {
  kind: keyof typeof LIFECYCLE;
  at: number;
  actor: string | null;
  overview: PrOverview;
  scheme: Scheme;
}) {
  const theme = EVA_THEME[scheme];
  const color = kind === "opened" ? theme.mutedForeground : prStatusAppearance(kind, overview.draft, scheme).text;
  return (
    <Row marker={<IconMarker icon={LIFECYCLE[kind].icon} color={color} scheme={scheme} />}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="font-instrument-sans-semibold" style={[TEXT_SM, { color: theme.foreground, fontWeight: "600" }]}>
          {actor ?? "Someone"}
        </Text>
        <Text style={[TEXT_SM, { color: theme.mutedForeground }]}>{LIFECYCLE[kind].label}</Text>
      </View>
      <View className="mt-0.5">
        <When at={at} scheme={scheme} />
      </View>
    </Row>
  );
}
