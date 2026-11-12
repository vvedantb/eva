import type { api } from "@eva/backend";
import { prStateLabel, prStateTone, type PrState, type PrStateTone } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChevronDown, IconDots, IconGitPullRequest, IconPlus } from "@tabler/icons-react-native";
import { SwipeableRow, swipeActionsAccessibility, type SwipeAction } from "@vvedantb/native-ui/primitives";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { displayTitle, timeAgo } from "@/ui/format";
import { RepoLogo } from "@/ui/RepoLogo";
import { RowStatus } from "@/ui/RowStatus";
import { type Scheme, useScheme, XS_TRACKING } from "@/ui/theme";

export type SessionRow = FunctionReturnType<typeof api.mobile.listChats>[number];

/** Rows before "Show more": the web sidebar's default `sessionPreviewCount`. */
const PREVIEW_LIMIT = 3;

/** The web `text-2xs` (11 / 16, 0.01em). */
const TEXT_2XS = { fontSize: 11, lineHeight: 16, letterSpacing: 0.11 };

/** The web PR icon colour (`text-success`, `text-status-code-review`, ...) for each tone. */
const PR_TONE_COLOUR: Record<PrStateTone, keyof (typeof EVA_THEME)["light"]> = {
  success: "success",
  codeReview: "statusCodeReview",
  destructive: "destructive",
  muted: "mutedForeground",
};

/** One repo of the Sessions list: its rows, the ones drawn now (`data`) and its fold state. */
export type SessionGroupSection = {
  repoId: string;
  repoLabel: string;
  rows: SessionRow[];
  /** The rows drawn: none while folded, three until "Show more", else all. */
  data: SessionRow[];
  open: boolean;
  expanded: boolean;
};

/**
 * The Sessions list as `SectionList` sections, one per repo in order of its
 * newest session (sessions stay newest first), with the web fold state: every
 * group starts open (the web opens only the URL's repo; this tab has none)
 * with three rows, and "Show more" shows the rest.
 */
export function useSessionGroups(sessions: SessionRow[] | undefined) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const byRepo = new Map<string, SessionRow[]>();
  for (const session of sessions ?? []) {
    byRepo.set(session.repoId, [...(byRepo.get(session.repoId) ?? []), session]);
  }
  const sections: SessionGroupSection[] = [...byRepo].map(([repoId, rows]) => {
    const open = !closed.has(repoId);
    const isExpanded = expanded.has(repoId);
    return {
      repoId,
      repoLabel: rows[0]?.repoLabel ?? "",
      rows,
      data: open ? (isExpanded ? rows : rows.slice(0, PREVIEW_LIMIT)) : [],
      open,
      expanded: isExpanded,
    };
  });
  const flip = (set: ReadonlySet<string>, repoId: string) => {
    const next = new Set(set);
    if (next.has(repoId)) next.delete(repoId);
    else next.add(repoId);
    return next;
  };
  return {
    sections,
    toggleOpen: (repoId: string) => setClosed(flip(closed, repoId)),
    toggleExpanded: (repoId: string) => setExpanded(flip(expanded, repoId)),
  };
}

/**
 * One repo's header in the Sessions list, as the web `GlobalSessionGroup` at
 * phone width: a button that folds the group (logo or initial, name, live
 * count, chevron) and the web "+" (a new session in this repo, Active list only).
 */
export function SessionGroupHeader({
  section,
  logoUrl,
  live,
  onToggle,
  onNew,
}: {
  section: SessionGroupSection;
  /** The repo's uploaded logo, drawn in place of the initial (the web `RepoLogo` at 18). */
  logoUrl: string | null | undefined;
  live: number;
  onToggle: () => void;
  /** Set in the Active list: the header "+". */
  onNew?: () => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const { repoLabel, open } = section;
  return (
    // The web header (the 18 logo or initial on `bg-muted`, then the medium
    // muted name, live count and a 14 chevron), 44 high: a whole touch target.
    // The name is `text-sm`, the phone floor for tappable text (the web is `text-xs`).
    <View className="flex-row items-center pr-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={repoLabel}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        className="min-h-11 flex-1 flex-row items-center gap-2 pl-4 active:opacity-70"
      >
        <RepoLogo
          logoUrl={logoUrl}
          size={18}
          fallback={
            <View
              className="h-[18px] w-[18px] items-center justify-center rounded-full"
              style={{ backgroundColor: EVA_THEME[scheme].muted }}
            >
              {/* The web `text-3xs` (10 / 14, 0.01em). */}
              <Text
                className="font-instrument-sans-semibold"
                style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0.1, color: muted, fontWeight: "600" }}
              >
                {repoLabel.charAt(0).toUpperCase()}
              </Text>
            </View>
          }
        />
        {/* `shrink`: a long repo name truncates, and the count, chevron and "+" stay on screen. */}
        <View className="min-w-0 shrink flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className="font-instrument-sans-medium min-w-0 shrink text-sm"
            style={{ color: muted, fontWeight: "500" }}
          >
            {repoLabel}
          </Text>
          {live > 0 ? (
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
        // The web group "+": a `size-10` ghost square (radius 8) with a muted 14 plus; the slop makes 44.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New session in ${repoLabel}`}
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
 * Under an open group's rows: the web `SessionListShowMore` past three rows
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
      {section.rows.length > PREVIEW_LIMIT ? (
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
  session,
  onLongPress,
  swipeAction,
}: {
  session: SessionRow;
  onLongPress: () => void;
  /** The row menu's Archive (or Unarchive), revealed by a swipe left. */
  swipeAction: SwipeAction;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const swipeA11y = swipeActionsAccessibility([swipeAction]);
  return (
    <SwipeableRow trailingActions={[swipeAction]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={displayTitle(session.title)}
        onPress={() => router.push({ pathname: "/chat/[target]", params: { target: session.sessionId } })}
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
        {/* The Inbox row title: `text-sm` (14 / 20) in the foreground. */}
        <Text
          numberOfLines={1}
          className="font-instrument-sans flex-1 text-sm"
          style={{ color: EVA_THEME[scheme].foreground }}
        >
          {displayTitle(session.title)}
        </Text>
        {session.prUrl ? <PrIcon state={session.prState} scheme={scheme} /> : null}
        <Text
          className="font-instrument-sans text-xs"
          style={{ color: muted, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
        >
          {timeAgo(session.updatedAt)}
        </Text>
      </Pressable>
    </SwipeableRow>
  );
}

/** The web `SessionPrIcon`: a pull-request icon in the PR state's tone, at 14 to sit with the 14 title. */
function PrIcon({ state, scheme }: { state: PrState | undefined; scheme: Scheme }) {
  return (
    <IconGitPullRequest
      size={14}
      color={EVA_THEME[scheme][PR_TONE_COLOUR[prStateTone(state)]]}
      accessibilityLabel={`PR: ${prStateLabel(state)}`}
    />
  );
}
