import type { api } from "@eva/backend";
import {
  entityHref,
  prStateLabel,
  prStateTone,
  repoDisplayLabel,
  repoTileSlot,
  sessionActivityAt,
  sortSessionsForSidebar,
  type PrState,
  type PrStateTone,
  type SessionListEntry,
  type SessionSortOrder,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChevronDown, IconDots, IconGitPullRequest, IconLink, IconPencil, IconPlus } from "@tabler/icons-react-native";
import { SwipeableRow, swipeActionsAccessibility, type SwipeAction } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { SessionActionTarget } from "@/sessions/useSessionActions";
import { persistedIdSet } from "@/storage/persistedStore";
import { displayTitle, timeAgo } from "@/ui/format";
import { RepoLogo } from "@/ui/RepoLogo";
import { RowStatus } from "@/ui/RowStatus";
import { type Scheme, useScheme, XS_TRACKING } from "@/ui/theme";

const closedSessionGroups = persistedIdSet("sessionGroupsClosed");

/** One row of the web `sessions.list` / `sessions.listArchived`. */
export type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];
export type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];
/** The web Sessions sidebar's sections (`sessionListEntries`) over those rows. */
export type SessionEntry = SessionListEntry<SessionListItem, RepoRow>;

/** One drawn row: the session, the app whose list it sits in, and whether it is in a linked group. */
export type SessionRow = { session: SessionListItem; repo: RepoRow; inGroup: boolean };

/** The row menu's target: the web path is the session's own app (`linkedFrom` on a linked-in row). */
export function sessionActionTarget({ session, repo, inGroup }: SessionRow): SessionActionTarget {
  return {
    sessionId: session._id,
    title: session.title,
    archived: session.archived,
    webPath: entityHref("session", session.linkedFrom ?? repo, session.numId),
    branchName: session.branchName,
    prUrl: session.prUrl,
    prState: session.prState,
    repoId: repo._id,
    inGroup,
  };
}

const TEXT_2XS = { fontSize: 11, lineHeight: 16, letterSpacing: 0.11 };

const PR_TONE_COLOUR: Record<PrStateTone, keyof (typeof EVA_THEME)["light"]> = {
  success: "success",
  codeReview: "statusCodeReview",
  destructive: "destructive",
  muted: "mutedForeground",
};

/** One section of the Sessions list (an app or a linked group): its rows, the ones drawn now (`data`) and its fold state. */
export type SessionGroupSection = {
  key: string;
  entry: SessionEntry;
  label: string;
  rows: SessionRow[];
  data: SessionRow[];
  open: boolean;
  expanded: boolean;
};

function entryRows(entry: SessionEntry, order: SessionSortOrder): SessionRow[] {
  if (entry.kind === "repo") {
    return sortSessionsForSidebar(entry.sessions ?? [], order).map((session) => ({
      session,
      repo: entry.repo,
      inGroup: false,
    }));
  }
  return [...entry.group.members]
    .sort((a, b) => sessionActivityAt(b.session) - sessionActivityAt(a.session))
    .map(({ session, repo }) => ({ session, repo, inGroup: true }));
}

/**
 * The Sessions list as `SectionList` sections, in the web sidebar's order
 * (`sessionListEntries`: linked groups and apps sorted together by their
 * newest row), with the web fold state: linked groups start open, as on the
 * web, and so do apps (the web opens only the URL's app; this tab has none),
 * with "Visible threads" rows (three by default), and "Show more" shows the rest. An app with no rows in
 * this list mode is left out (the web draws its empty copy in the group).
 */
export function useSessionGroups(
  entries: SessionEntry[] | undefined,
  { sessionSortOrder, sessionPreviewCount }: { sessionSortOrder: SessionSortOrder; sessionPreviewCount: number },
) {
  const [closed, toggleClosed] = closedSessionGroups.useSet("all");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const sections: SessionGroupSection[] = (entries ?? []).flatMap((entry) => {
    const rows = entryRows(entry, sessionSortOrder);
    if (rows.length === 0) return [];
    const open = !closed.has(entry._id);
    const isExpanded = expanded.has(entry._id);
    return [
      {
        key: entry._id,
        entry,
        label: entry.kind === "repo" ? repoDisplayLabel(entry.repo) : entry.group.label,
        rows,
        data: open ? (isExpanded ? rows : rows.slice(0, sessionPreviewCount)) : [],
        open,
        expanded: isExpanded,
      },
    ];
  });
  const flip = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  return {
    sections,
    toggleOpen: toggleClosed,
    toggleExpanded: (key: string) => setExpanded(flip(expanded, key)),
  };
}

/**
 * One section's header in the Sessions list, at phone width: a button that
 * folds the section, then the web "+" on an app (a new session in it, Active
 * list only). An app is the web `GlobalSessionGroup` header (logo or initial,
 * name, live count, chevron); a linked group is the web
 * `LinkedSessionGroupSection` header (link tile, name, member count,
 * chevron), whose long press opens its menu (the web right-click).
 */
export function SessionGroupHeader({
  section,
  live,
  onToggle,
  onNew,
  onLongPress,
}: {
  section: SessionGroupSection;
  live: number;
  onToggle: () => void;
  onNew?: () => void;
  onLongPress?: () => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const { entry, label, open } = section;
  const memberCount = entry.kind === "group" ? entry.group.members.length : 0;
  return (
    <View className="flex-row items-center pr-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entry.kind === "group" ? `${label}, ${memberCount} linked sessions` : label}
        accessibilityState={{ expanded: open }}
        accessibilityActions={onLongPress ? [{ name: "longpress", label: "Group actions" }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "longpress") onLongPress?.();
        }}
        onPress={onToggle}
        onLongPress={onLongPress}
        className="min-h-11 flex-1 flex-row items-center gap-2 pl-4 active:opacity-70"
      >
        {entry.kind === "group" ? (
          <View
            className="h-[18px] w-[18px] items-center justify-center rounded-sm"
            style={{ backgroundColor: EVA_THEME[scheme].muted }}
          >
            <IconLink size={12} color={muted} />
          </View>
        ) : (
          <RepoLogo
            logoUrl={entry.repo.logoUrl}
            size={18}
            fallback={
              <View
                className="h-[18px] w-[18px] items-center justify-center rounded-full"
                style={{ backgroundColor: EVA_THEME[scheme].muted }}
              >
                <Text
                  className="font-instrument-sans-semibold"
                  style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0.1, color: muted, fontWeight: "600" }}
                >
                  {label.charAt(0).toUpperCase()}
                </Text>
              </View>
            }
          />
        )}
        <View className="min-w-0 shrink flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className="font-instrument-sans-medium min-w-0 shrink text-sm"
            style={{ color: muted, fontWeight: "500" }}
          >
            {label}
          </Text>
          {entry.kind === "group" ? (
            <Text
              className="font-instrument-sans"
              style={{ ...TEXT_2XS, color: withAlpha(muted, 0.7), fontVariant: ["tabular-nums"] }}
            >
              {memberCount}
            </Text>
          ) : live > 0 ? (
            <View className="flex-row items-center gap-1 px-1.5" accessibilityLabel={`${live} running`}>
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EVA_THEME[scheme].success }} />
              <Text
                className="font-instrument-sans-medium"
                style={{ ...TEXT_2XS, color: muted, fontWeight: "500", fontVariant: ["tabular-nums"] }}
              >
                {live}
              </Text>
            </View>
          ) : null}
          <View style={open ? undefined : { transform: [{ rotate: "-90deg" }] }}>
            <IconChevronDown size={14} color={muted} />
          </View>
        </View>
      </Pressable>
      {onNew ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New session in ${label}`}
          onPress={onNew}
          hitSlop={2}
          className="h-10 w-10 items-center justify-center rounded-lg active:opacity-70"
        >
          <IconPlus size={14} color={muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Under an open group's rows: the web `SessionListShowMore` past "Visible threads" rows
 * (medium muted, a 12 dots icon in the 18 status slot), a 44 high row, then
 * the group's `pb-1`. The label is `text-sm` (the web `text-xs`), as the
 * header. A folded group has neither.
 */
export function SessionGroupFooter({ section, onToggleExpanded }: { section: SessionGroupSection; onToggleExpanded: () => void }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  if (!section.open) return null;
  const hiddenCount = section.rows.length - section.data.length;
  return (
    <View className="pb-1">
      {/* Past "Visible threads" rows: rows are hidden, or were and Show less folds them again. */}
      {section.expanded || hiddenCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: section.expanded }}
          onPress={onToggleExpanded}
          className="min-h-11 flex-row items-center gap-3 px-4 active:opacity-70"
        >
          <View className="w-[18px] items-center">
            <IconDots size={12} color={muted} />
          </View>
          <Text
            className="font-instrument-sans-medium text-sm"
            style={{ color: muted, fontWeight: "500" }}
          >
            {section.expanded ? "Show less" : `Show more (${hiddenCount})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The web `SidebarSessionItem` row (status, title, PR icon, age) at the
 * Inbox row's size, for a thumb: 56 high, a 14 title in the foreground, the
 * age in the Inbox `text-xs`. The web drawer's 30 high rows were too tight to
 * tap. A long press opens its menu (the web right-click).
 */
export function SessionListRow({
  row,
  hasDraft,
  onOpenMenu,
  swipe,
  onSwipe,
}: {
  row: SessionRow;
  /** The user has an unsent message in this chat (`drafts.listMarks`): a pencil in the unread dot's place. */
  hasDraft: boolean;
  /** A long press: the row menu. The same function for every row, so an unchanged row keeps its output. */
  onOpenMenu: (row: SessionRow) => void;
  /** The look of the row menu's Archive (or Unarchive), revealed by a swipe left. */
  swipe: Omit<SwipeAction, "onPress">;
  /** Runs that action on this row; the same function for every row. */
  onSwipe: (row: SessionRow) => ReturnType<SwipeAction["onPress"]>;
}) {
  const { session, repo, inGroup } = row;
  const onLongPress = () => onOpenMenu(row);
  const swipeAction: SwipeAction = { ...swipe, onPress: () => onSwipe(row) };
  const router = useRouter();
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const swipeA11y = swipeActionsAccessibility([swipeAction]);
  return (
    <SwipeableRow trailingActions={[swipeAction]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={inGroup ? `${displayTitle(session.title)}, ${repoDisplayLabel(repo)}` : displayTitle(session.title)}
        onPress={() => router.push({ pathname: "/chat/[target]", params: { target: session._id } })}
        onLongPress={onLongPress}
        // VoiceOver and TalkBack reach the menu and the swipe action through the actions rotor.
        accessibilityActions={[{ name: "longpress", label: "Session actions" }, ...swipeA11y.accessibilityActions]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "longpress") onLongPress();
          else swipeA11y.onAccessibilityAction(event);
        }}
        className="min-h-14 flex-row items-center gap-3 px-4 active:opacity-70"
      >
        <RowStatus
          awaitingAnswer={session.isAwaitingAnswer}
          working={session.isExecuting}
          // `cancelled` is the muted 40% dot, the web idle `bg-muted-foreground/40`.
          tone={session.status === "active" ? "active" : "cancelled"}
        />
        {/* A linked-group row names its app, as the web row's app mark. */}
        {inGroup ? <RepoAppMark repo={repo} scheme={scheme} /> : null}
        {/* The Inbox row title: `text-sm` (14 / 20) in the foreground. */}
        <Text
          numberOfLines={1}
          className="font-instrument-sans flex-1 text-sm"
          style={{ color: EVA_THEME[scheme].foreground }}
        >
          {displayTitle(session.title)}
        </Text>
        {/* The web `UnreadDot`: a reply you have not read, while Eva is not working. One mark: unread wins over the unsent-message pencil. */}
        {session.hasUnread && !session.isExecuting ? (
          <View accessibilityLabel="Unread" className="size-1.5 rounded-full" style={{ backgroundColor: EVA_THEME[scheme].primary }} />
        ) : hasDraft ? (
          <IconPencil size={12} color={muted} accessibilityLabel="Unsent message" />
        ) : null}
        {session.prUrl ? <PrIcon state={session.prState} scheme={scheme} /> : null}
        <Text
          className="font-instrument-sans text-xs"
          style={{ color: muted, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
        >
          {timeAgo(sessionActivityAt(session))}
        </Text>
      </Pressable>
    </SwipeableRow>
  );
}

/** The web `SessionPrIcon`: a pull-request icon in the PR state's tone, at 14 to sit with the 14 title. */
export function PrIcon({ state, scheme, size = 14 }: { state: PrState | undefined; scheme: Scheme; size?: number }) {
  return (
    <IconGitPullRequest
      size={size}
      color={EVA_THEME[scheme][PR_TONE_COLOUR[prStateTone(state)]]}
      accessibilityLabel={`PR: ${prStateLabel(state)}`}
    />
  );
}

/**
 * The web `RepoAppMark` beside a linked-group row's title: the app's logo,
 * else its initial on its web tile colour (`repoTileSlot`, a 12% tint).
 * 16 rather than the web 14, to sit with the 14 title, as the chat header tile.
 */
export function RepoAppMark({ repo, scheme }: { repo: RepoRow; scheme: Scheme }) {
  const label = repoDisplayLabel(repo);
  const tile = EVA_THEME[scheme][`cat${repoTileSlot(`${repo.owner}/${repo.name}/${label}`)}`];
  return (
    <RepoLogo
      logoUrl={repo.logoUrl}
      size={16}
      fallback={
        <View
          className="h-4 w-4 items-center justify-center rounded-full"
          style={{ backgroundColor: withAlpha(tile, 0.12) }}
        >
          <Text className="font-instrument-sans-semibold" style={{ fontSize: 9, color: tile, fontWeight: "600" }}>
            {label.charAt(0).toUpperCase()}
          </Text>
        </View>
      }
    />
  );
}
