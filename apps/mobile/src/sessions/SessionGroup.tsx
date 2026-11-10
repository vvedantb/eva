import type { api } from "@eva/backend";
import { prStateLabel, prStateTone, type PrState, type PrStateTone } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChevronDown, IconDots, IconGitPullRequest, IconPlus } from "@tabler/icons-react-native";
import { palette, tokens, withAlpha } from "@vvedantb/native-ui/theme";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { timeAgo } from "@/ui/format";
import { RowStatus } from "@/ui/RowStatus";
import { type Scheme, useScheme, XS_TRACKING } from "@/ui/theme";

export type SessionRow = FunctionReturnType<typeof api.mobile.listChats>[number];

/** Rows before "Show more": the web sidebar's default `sessionPreviewCount`. */
const PREVIEW_LIMIT = 3;

/** The web rows are 30 high (`py-1.5` around an 18 line); this slop makes a 44 target. */
const ROW_SLOP = { top: 7, bottom: 7 };

/** The web `text-2xs` (11 / 16, 0.01em). */
const TEXT_2XS = { fontSize: 11, lineHeight: 16, letterSpacing: 0.11 };

/** The web PR icon colour (`text-success`, `text-status-code-review`, ...) for each tone. */
const PR_TONE_COLOUR: Record<PrStateTone, keyof (typeof EVA_THEME)["light"]> = {
  success: "success",
  codeReview: "statusCodeReview",
  destructive: "destructive",
  muted: "mutedForeground",
};

/**
 * One repo in the Sessions list, as the web `GlobalSessionGroup` at phone
 * width: a header that collapses the group (initial, name, live count,
 * chevron) with the web "+" (a new session in this repo, Active list only),
 * the first three rows, then "Show more (N)". A long press on a row opens its
 * menu (`onRowLongPress`), as a right-click does on the web.
 */
export function SessionGroup({
  repoLabel,
  rows,
  live,
  onNew,
  onRowLongPress,
}: {
  repoLabel: string;
  rows: SessionRow[];
  live: number;
  /** Set in the Active list: the header "+". */
  onNew?: () => void;
  onRowLongPress: (session: SessionRow) => void;
}) {
  // The web opens only the group of the repo in the URL; this tab has none, so all start open.
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const scheme = useScheme();
  const muted = tokens.color.muted[scheme];
  const visible = expanded ? rows : rows.slice(0, PREVIEW_LIMIT);
  const hiddenCount = rows.length - visible.length;

  return (
    <View>
      {/* Web header: 40 high at phone width (the row of its `size-10` "+"), an 18
      initial on `bg-muted`, then the text-xs medium muted name, live count and a 14 chevron. */}
      <View className="flex-row items-center pr-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={repoLabel}
          aria-expanded={open}
          onPress={() => setOpen(!open)}
          hitSlop={2}
          className="min-h-10 flex-1 flex-row items-center gap-2 pl-4 active:opacity-70"
        >
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
          <View className="flex-row items-center gap-1.5">
            <Text
              className="font-instrument-sans-medium text-xs"
              style={{ color: muted, fontWeight: "500", letterSpacing: XS_TRACKING }}
            >
              {repoLabel}
            </Text>
            {live > 0 ? (
              <View className="flex-row items-center gap-1 px-1.5" accessibilityLabel={`${live} running`}>
                <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.success[scheme] }} />
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
      {open ? (
        // Web: `pb-1` under the group, `space-y-0.5` between rows.
        <View className="gap-0.5 pb-1">
          {visible.map((session) => (
            <SessionListRow
              key={session.sessionId}
              session={session}
              scheme={scheme}
              onLongPress={() => onRowLongPress(session)}
            />
          ))}
          {rows.length > PREVIEW_LIMIT ? (
            // Web `SessionListShowMore`: text-xs medium muted, a 12 dots icon in the 18 status slot.
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpanded(!expanded)}
              hitSlop={{ top: 8, bottom: 8 }}
              className="flex-row items-center gap-2 px-4 py-1.5 active:opacity-70"
            >
              <View className="w-[18px] items-center">
                <IconDots size={12} color={muted} />
              </View>
              <Text
                className="font-instrument-sans-medium text-xs"
                style={{ color: muted, fontWeight: "500", letterSpacing: XS_TRACKING }}
              >
                {expanded ? "Show less" : `Show more (${hiddenCount})`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The web `SidebarSessionItem` row: status, title, PR icon, age. A long press opens its menu. */
function SessionListRow({
  session,
  scheme,
  onLongPress,
}: {
  session: SessionRow;
  scheme: Scheme;
  onLongPress: () => void;
}) {
  const router = useRouter();
  const muted = tokens.color.muted[scheme];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={session.title}
      onPress={() => router.push({ pathname: "/chat/[target]", params: { target: session.sessionId } })}
      onLongPress={onLongPress}
      // VoiceOver and TalkBack reach the menu through the actions rotor.
      accessibilityActions={[{ name: "longpress", label: "Session actions" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") onLongPress();
      }}
      hitSlop={ROW_SLOP}
      className="flex-row items-center gap-2 px-4 py-1.5 active:opacity-70"
    >
      <RowStatus
        awaitingAnswer={session.isAwaitingAnswer}
        // `cancelled` is the muted 40% dot, the web idle `bg-muted-foreground/40`.
        tone={session.status === "active" ? "active" : "cancelled"}
      />
      {/* The web title: `text-2sm leading-[18px]` (13 / 18) at 80% foreground. */}
      <Text
        numberOfLines={1}
        className="font-instrument-sans flex-1 text-[13px] leading-[18px]"
        style={{ color: withAlpha(tokens.color.foreground[scheme], 0.8), letterSpacing: 0.065 }}
      >
        {session.title}
      </Text>
      {session.prUrl ? <PrIcon state={session.prState} scheme={scheme} /> : null}
      <Text className="font-instrument-sans" style={{ ...TEXT_2XS, color: muted, fontVariant: ["tabular-nums"] }}>
        {timeAgo(session.updatedAt)}
      </Text>
    </Pressable>
  );
}

/** The web `SessionPrIcon`: a 12 pull-request icon in the PR state's tone. */
function PrIcon({ state, scheme }: { state: PrState | undefined; scheme: Scheme }) {
  return (
    <IconGitPullRequest
      size={12}
      color={EVA_THEME[scheme][PR_TONE_COLOUR[prStateTone(state)]]}
      accessibilityLabel={`PR: ${prStateLabel(state)}`}
    />
  );
}
