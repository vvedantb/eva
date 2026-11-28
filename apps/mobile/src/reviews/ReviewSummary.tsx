import { api, isViewableRecap, type Id } from "@eva/backend";
import {
  buildSummaryComments,
  checkTone,
  checksHeadline,
  countChecks,
  prReviewers,
  reviewStateMeta,
  splitSummaryComments,
  type PrOverview,
  type SummaryComment,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconArrowUpRight,
  IconArrowsSort,
  IconChevronRight,
  IconExternalLink,
  IconFileCode,
  IconPencil,
  IconRocket,
  IconTag,
  IconUserCheck,
  IconUsers,
  type IconProps,
} from "@tabler/icons-react-native";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Avatar, AvatarFallback, AvatarImage, Button, ListDivider } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useState, type ComponentType, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { z } from "zod";
import { jsonParser, persistedStore } from "@/storage/persistedStore";
import { ToneIcon } from "@/reviews/prAppearance";
import { DescriptionEditSheet, LabelDot, PrMetaEditButton, usePrMetaEdit } from "@/reviews/PrMetaEdit";
import { ReviewRecap } from "@/reviews/ReviewRecap";
import { timeAgo } from "@/ui/format";
import { type Scheme, useScheme, XS_TRACKING } from "@/ui/theme";

const commentOrder = persistedStore<"newest" | "oldest">("prCommentOrder", "newest", jsonParser(z.enum(["newest", "oldest"])));

const COMMENT_PAGE = 10;

/** The web `text-sm` (14 / 20): titles a thumb taps, and the meta rows' labels and values. */
export const TEXT_SM = { fontSize: 14, lineHeight: 20 };
/** The web `text-xs` (12 / 16): the smallest text on these tabs (the web's 10 and 11 are a desktop size). */
export const TEXT_XS = { fontSize: 12, lineHeight: 16, letterSpacing: XS_TRACKING };

const VERDICT_RING: Record<string, keyof (typeof EVA_THEME)["light"]> = {
  APPROVED: "success",
  CHANGES_REQUESTED: "destructive",
};

/**
 * The web Summary tab at phone width: the label rows (reviewers, assignees,
 * labels, previews), each set with its pencil; then folding sections: Recap
 * (open when there is a walkthrough to read), Description (with its pencil),
 * Checks (folded) and Comments. Every edit reads the overview again
 * (`onChanged`).
 */
export function ReviewSummary({
  repoId,
  overview,
  prUrl,
  defaultModel,
  onChanged,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  prUrl: string;
  defaultModel: string | undefined;
  onChanged: () => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const checks = countChecks(overview.checks);
  const body = overview.body ?? "";
  const recapDoc = useQuery(api.docs.getRecapByPrUrl, { repoId, prUrl });
  const hasRecap = recapDoc !== undefined && recapDoc !== null && isViewableRecap(recapDoc);
  const [editingBody, setEditingBody] = useState(false);
  return (
    <View>
      <MetaRows repoId={repoId} overview={overview} onChanged={onChanged} scheme={scheme} />
      <Section key={`recap:${hasRecap}`} title="Recap" defaultOpen={hasRecap}>
        <ReviewRecap pr={{ repoId, prNumber: overview.number }} prUrl={prUrl} recapDoc={recapDoc} defaultModel={defaultModel} />
      </Section>
      <Section
        title="Description"
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit description"
            onPress={() => setEditingBody(true)}
            className="size-11 items-center justify-center rounded-full active:opacity-70"
          >
            <IconPencil size={13} color={muted} />
          </Pressable>
        }
      >
        {body.trim().length > 0 ? (
          <Markdown>{body}</Markdown>
        ) : (
          <Text className="font-instrument-sans text-sm italic" style={{ color: muted }}>
            No description provided.
          </Text>
        )}
      </Section>
      <DescriptionEditSheet
        open={editingBody}
        onOpenChange={setEditingBody}
        repoId={repoId}
        prNumber={overview.number}
        body={body}
        onSaved={onChanged}
      />
      <Section title={checks.total === 0 ? "Checks" : `Checks · ${checksHeadline(checks)}`} defaultOpen={false}>
        {checks.total === 0 ? (
          <Note scheme={scheme}>No checks reported.</Note>
        ) : (
          overview.checks.map((check) => (
            <LinkRow key={`${check.kind}-${check.name}`} url={check.htmlUrl} label={check.name}>
              <ToneIcon tone={checkTone(check)} scheme={scheme} />
              <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: EVA_THEME[scheme].foreground }}>
                {check.name}
              </Text>
              {check.htmlUrl ? <IconExternalLink size={12} color={muted} /> : null}
            </LinkRow>
          ))
        )}
        {overview.checksTruncated ? (
          <Note scheme={scheme} boxed>{`Only the first ${overview.checks.length} checks are shown.`}</Note>
        ) : null}
      </Section>
      <Comments overview={overview} scheme={scheme} />
    </View>
  );
}

function MetaRows({
  repoId,
  overview,
  onChanged,
  scheme,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  onChanged: () => void;
  scheme: Scheme;
}) {
  const edit = usePrMetaEdit(repoId, overview.number, onChanged);
  const theme = EVA_THEME[scheme];
  const reviewers = prReviewers(overview);
  const none = <Text style={[TEXT_SM, { color: theme.mutedForeground }]}>None</Text>;
  return (
    <View className="px-4 pb-1 pt-1">
      <MetaRow
        icon={IconUsers}
        label="Reviewers"
        scheme={scheme}
        action={<PrMetaEditButton field="reviewers" selected={overview.requestedReviewers.map((reviewer) => reviewer.login)} edit={edit} />}
      >
        {reviewers.length === 0
          ? none
          : reviewers.map((reviewer) => (
              <Person
                key={reviewer.login}
                login={reviewer.login}
                avatarUrl={reviewer.avatarUrl}
                ring={VERDICT_RING[reviewer.state]}
                faded={reviewer.state === "REQUESTED"}
                hint={reviewer.state === "REQUESTED" ? "Awaiting review" : reviewStateMeta(reviewer.state).label}
                scheme={scheme}
              />
            ))}
      </MetaRow>
      <ListDivider />
      <MetaRow
        icon={IconUserCheck}
        label="Assignees"
        scheme={scheme}
        action={<PrMetaEditButton field="assignees" selected={overview.assignees.map((assignee) => assignee.login)} edit={edit} />}
      >
        {overview.assignees.length === 0
          ? none
          : overview.assignees.map((assignee) => (
              <Person key={assignee.login} login={assignee.login} avatarUrl={assignee.avatarUrl} scheme={scheme} />
            ))}
      </MetaRow>
      <ListDivider />
      <MetaRow
        icon={IconTag}
        label="Labels"
        scheme={scheme}
        action={<PrMetaEditButton field="labels" selected={overview.labels.map((label) => label.name)} edit={edit} />}
      >
        {overview.labels.length === 0
          ? none
          : overview.labels.map((label) => (
              <View
                key={label.name}
                className="max-w-48 flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ backgroundColor: withAlpha(theme.muted, 0.6) }}
              >
                <LabelDot color={label.color} />
                <Text numberOfLines={1} style={[TEXT_XS, { color: theme.foreground }]}>
                  {label.name}
                </Text>
              </View>
            ))}
      </MetaRow>
      {overview.previews.length === 0 ? null : (
        <>
        <ListDivider />
        <MetaRow icon={IconRocket} label="Previews" scheme={scheme}>
          <View className="min-w-0 flex-1">
            {overview.previews.map((preview) => (
              <LinkRow key={`${preview.environment}-${preview.updatedAt}`} url={preview.url} label={previewLabel(preview)}>
                <Text numberOfLines={1} className="min-w-0 flex-1" style={[TEXT_SM, { color: theme.foreground }]}>
                  {previewLabel(preview)}
                </Text>
                <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>{timeAgo(new Date(preview.updatedAt).getTime())}</Text>
                {preview.url === null ? null : <IconArrowUpRight size={13} color={theme.mutedForeground} />}
              </LinkRow>
            ))}
          </View>
        </MetaRow>
        </>
      )}
    </View>
  );
}

function MetaRow({
  icon: Icon,
  label,
  scheme,
  action,
  children,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  scheme: Scheme;
  action?: ReactNode;
  children: ReactNode;
}) {
  const muted = EVA_THEME[scheme].mutedForeground;
  return (
    <View className="min-h-14 flex-row items-center gap-2 py-1.5">
      <View className="w-28 flex-row items-center gap-2 self-start" style={{ minHeight: 44 }}>
        <Icon size={16} color={muted} />
        <Text style={[TEXT_SM, { color: muted }]}>{label}</Text>
      </View>
      <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-1.5 py-2.5">{children}</View>
      {action ? <View className="self-start">{action}</View> : null}
    </View>
  );
}

function Person({
  login,
  avatarUrl,
  ring,
  faded = false,
  hint,
  scheme,
}: {
  login: string;
  avatarUrl: string | null;
  ring?: keyof (typeof EVA_THEME)["light"];
  faded?: boolean;
  hint?: string;
  scheme: Scheme;
}) {
  const theme = EVA_THEME[scheme];
  return (
    <View
      accessible
      accessibilityLabel={hint ? `${login}, ${hint}` : login}
      className="min-w-0 flex-row items-center gap-1.5"
      style={{ opacity: faded ? 0.6 : 1 }}
    >
      <View className="rounded-full" style={ring ? { borderWidth: 2, borderColor: theme[ring] } : undefined}>
        <PrAvatar login={login} avatarUrl={avatarUrl} size={20} />
      </View>
      <Text numberOfLines={1} className="min-w-0 shrink" style={[TEXT_SM, { color: theme.foreground }]}>
        {login}
      </Text>
    </View>
  );
}

/** The web `PrAvatar`: the GitHub avatar, or the login's first two letters. */
export function PrAvatar({ login, avatarUrl, size }: { login: string | null; avatarUrl: string | null; size: number }) {
  return (
    <Avatar size={size}>
      {avatarUrl ? <AvatarImage source={{ uri: avatarUrl }} /> : null}
      <AvatarFallback>{login === null ? "?" : login.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function LinkRow({ url, label, children }: { url: string | null; label: string; children: ReactNode }) {
  if (url === null) return <View className="min-h-14 flex-row items-center gap-2 px-1.5">{children}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void Linking.openURL(url)}
      className="min-h-14 flex-row items-center gap-2 rounded-md px-1.5 active:opacity-70"
    >
      {children}
    </Pressable>
  );
}

function previewLabel(preview: PrOverview["previews"][number]): string {
  if (preview.url === null) return preview.environment;
  try {
    return new URL(preview.url).hostname || preview.url;
  } catch {
    return preview.url;
  }
}

function Section({
  title,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const theme = EVA_THEME[useScheme()];
  const muted = theme.mutedForeground;
  return (
    <View>
      <View className="flex-row items-center pr-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          className="min-h-12 min-w-0 flex-1 flex-row items-center gap-1.5 px-4 active:opacity-70"
        >
          <Text numberOfLines={1} className="font-instrument-sans-medium shrink" style={[TEXT_SM, { color: theme.foreground, fontWeight: "500" }]}>
            {title}
          </Text>
          <View style={open ? { transform: [{ rotate: "90deg" }] } : undefined}>
            <IconChevronRight size={14} color={withAlpha(muted, 0.6)} />
          </View>
        </Pressable>
        {actions}
      </View>
      {open ? <View className="px-4 pb-4">{children}</View> : null}
    </View>
  );
}

function Note({ scheme, boxed = false, children }: { scheme: Scheme; boxed?: boolean; children: string }) {
  const theme = EVA_THEME[scheme];
  return (
    <Text
      className={boxed ? "mt-2 rounded-md px-3 py-2" : "py-2"}
      style={[TEXT_XS, { color: theme.mutedForeground }, boxed ? { backgroundColor: withAlpha(theme.muted, 0.5) } : null]}
    >
      {children}
    </Text>
  );
}

function Comments({ overview, scheme }: { overview: PrOverview; scheme: Scheme }) {
  const order = commentOrder.useValue("all");
  const setOrder = (next: "newest" | "oldest") => commentOrder.set("all", next);
  const [shown, setShown] = useState(COMMENT_PAGE);
  const all = buildSummaryComments(overview);
  const { people, bots } = splitSummaryComments(all, order);
  const visible = people.slice(0, shown);
  const hidden = people.length - visible.length;
  const muted = EVA_THEME[scheme].mutedForeground;

  return (
    <Section
      title={`Comments (${all.length}${overview.commentsTruncated ? "+" : ""})`}
      actions={
        <Button
          size="sm"
          variant="ghost"
          fullWidth={false}
          className="self-center"
          leftIcon={<IconArrowsSort size={14} color={muted} />}
          accessibilityLabel={order === "newest" ? "Show oldest comments first" : "Show newest comments first"}
          onPress={() => setOrder(order === "newest" ? "oldest" : "newest")}
        >
          {order === "newest" ? "Newest first" : "Oldest first"}
        </Button>
      }
    >
      {overview.commentsTruncated ? (
        <Note scheme={scheme} boxed>
          {`This conversation is longer than one read. The most recent ${overview.comments.length} are here; open it on GitHub to read the rest.`}
        </Note>
      ) : null}
      {all.length === 0 ? (
        <Note scheme={scheme}>No comments yet.</Note>
      ) : (
        <View className="gap-3">
          {visible.map((comment) => (
            <CommentCard key={comment.key} comment={comment} scheme={scheme} framed />
          ))}
          {hidden > 0 ? (
            <Button size="sm" variant="outline" onPress={() => setShown(shown + COMMENT_PAGE)}>
              {`Show ${Math.min(hidden, COMMENT_PAGE)} more (${hidden} hidden)`}
            </Button>
          ) : null}
          {bots.length > 0 ? <BotGroup comments={bots} scheme={scheme} /> : null}
        </View>
      )}
    </Section>
  );
}

/**
 * The web `PrCommentCard`: the face, the login in semibold, the action and
 * any verdict; then the age and the file and line; then the markdown. The
 * GitHub link is the card's own press, as a phone has no hover to reveal it.
 */
export function CommentCard({ comment, scheme, framed }: { comment: SummaryComment; scheme: Scheme; framed: boolean }) {
  const theme = EVA_THEME[scheme];
  const muted = theme.mutedForeground;
  return (
    <View className={framed ? "rounded-lg px-3 py-2.5" : "px-2 py-2"} style={framed ? { backgroundColor: theme.card } : undefined}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${comment.authorLogin ?? "ghost"} ${comment.action}. Open on GitHub`}
        onPress={() => void Linking.openURL(comment.htmlUrl)}
        className="flex-row items-start gap-2 active:opacity-70"
      >
        <View className="pt-0.5">
          <PrAvatar login={comment.authorLogin} avatarUrl={comment.authorAvatarUrl} size={20} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-x-1.5">
            <Text className="font-instrument-sans-semibold" style={[TEXT_SM, { color: theme.foreground, fontWeight: "600" }]}>
              {comment.authorLogin ?? "ghost"}
            </Text>
            <Text style={[TEXT_SM, { color: muted }]}>{comment.action}</Text>
            {comment.verdict === null ? null : (
              <Text className="font-instrument-sans-medium" style={[TEXT_XS, { color: muted, fontWeight: "500" }]}>
                {comment.verdict}
              </Text>
            )}
          </View>
          <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2">
            {comment.at === null ? null : <Text style={[TEXT_XS, { color: muted }]}>{timeAgo(new Date(comment.at).getTime())}</Text>}
            {comment.path ? (
              <View className="min-w-0 shrink flex-row items-center gap-1">
                <IconFileCode size={12} color={muted} />
                <Text numberOfLines={1} ellipsizeMode="middle" className="min-w-0 shrink" style={[TEXT_XS, { color: muted, fontFamily: "monospace" }]}>
                  {`${comment.path}${comment.line === undefined || comment.line === null ? "" : `:${comment.line}`}`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <IconExternalLink size={12} color={muted} />
      </Pressable>
      {comment.body.trim().length > 0 ? (
        <View className="mt-2">
          <Markdown>{comment.body}</Markdown>
        </View>
      ) : null}
    </View>
  );
}

function BotGroup({ comments, scheme }: { comments: readonly SummaryComment[]; scheme: Scheme }) {
  const [open, setOpen] = useState(false);
  const theme = EVA_THEME[scheme];
  const muted = theme.mutedForeground;
  const authors = [...new Map(comments.map((comment) => [comment.authorLogin, comment])).values()];
  const latest = comments[0]?.at ?? null;
  return (
    <View className="overflow-hidden rounded-lg" style={{ backgroundColor: theme.card }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        className="min-h-16 flex-row items-center gap-3 px-3 py-3 active:opacity-70"
      >
        <View className="flex-row">
          {authors.slice(0, 3).map((author, index) => (
            <View key={author.authorLogin} className="rounded-full" style={{ marginLeft: index === 0 ? 0 : -6, borderWidth: 2, borderColor: theme.card }}>
              <PrAvatar login={author.authorLogin} avatarUrl={author.authorAvatarUrl} size={20} />
            </View>
          ))}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-instrument-sans-medium" style={[TEXT_SM, { color: theme.foreground, fontWeight: "500" }]}>
            {`${comments.length} bot ${comments.length === 1 ? "comment" : "comments"}`}
          </Text>
          <Text style={[TEXT_XS, { color: muted }]}>
            {`${authors.length} ${authors.length === 1 ? "author" : "authors"}${latest === null ? "" : ` · Latest ${timeAgo(new Date(latest).getTime())}`}`}
          </Text>
        </View>
        <View style={open ? { transform: [{ rotate: "90deg" }] } : undefined}>
          <IconChevronRight size={13} color={muted} />
        </View>
      </Pressable>
      {open ? (
        <View className="gap-1 px-1 pb-1">
          {comments.map((comment) => (
            <CommentCard key={comment.key} comment={comment} scheme={scheme} framed={false} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
