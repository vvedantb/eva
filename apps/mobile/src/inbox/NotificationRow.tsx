import type { Doc } from "@eva/backend";
import { getNotificationAppearance } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { splitNotificationTitle } from "@eva/shared/notificationTitle";
import { IconArchive, IconArchiveOff, IconCheck, IconMail, IconMailOpened } from "@tabler/icons-react-native";
import {
  Avatar,
  AvatarFallback,
  Checkbox,
  SwipeableRow,
  swipeActionsAccessibility,
  type SwipeAction,
} from "@vvedantb/native-ui/primitives";
import { palette, tokens } from "@vvedantb/native-ui/theme";
import { Pressable, Text, View } from "react-native";
import { timeAgo } from "@/ui/format";
import { RepoLogo } from "@/ui/RepoLogo";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { NOTIFICATION_ICONS, toneColors } from "./notificationAppearance";

/** The repo fields the leading mark reads. */
export type NotificationRepo = { label: string; logoUrl?: string | null };

/**
 * One inbox row, as Eva's web `NotificationRow` at phone width: a 6-wide unread
 * dot slot, the source mark (the repo logo or initial, else the type glyph in a
 * 32 tinted circle), the subject (medium when unread) over the event line, the
 * time, the type glyph in its tone, and a 40 check that marks an unread row
 * read. Flat; `DividedList` draws the hairlines. The web right-click menu is
 * a swipe: right to mark read or unread, left to archive or unarchive (the
 * row slides out). Screen readers get both as row actions. Off in select mode.
 */
export function NotificationRow({
  notification,
  repo,
  onPress,
  onMarkRead,
  onToggleRead,
  onToggleArchive,
  selection,
}: {
  notification: Doc<"notifications">;
  repo: NotificationRepo | undefined;
  onPress: () => void;
  onMarkRead: () => void;
  /** The web menu's Mark as read / Mark as unread. */
  onToggleRead: () => void;
  /** The web menu's Archive / Unarchive: the promise rejects when it fails, so the row comes back. */
  onToggleArchive: () => Promise<unknown>;
  /** Select mode, as the web: a checkbox leads the row, a press toggles it, and Mark read hides. */
  selection?: { checked: boolean; onToggle: () => void };
}) {
  const scheme = useScheme();
  const muted = tokens.color.muted[scheme];
  const unread = !notification.read;
  // A low-urgency row reads as already read even while unread, as on the web.
  const emphasised = unread && notification.urgency !== "low";
  const { subject, event } = splitNotificationTitle(notification);
  // No event phrase: the repo keeps a second line, so rows stay one height.
  const detail = event ?? repo?.label;
  const appearance = getNotificationAppearance(notification);
  const Glyph = NOTIFICATION_ICONS[appearance.icon];
  const tone = toneColors(appearance.tone, scheme);
  const archived = notification.archivedAt !== undefined;
  // The web menu items, their wording and icons. Archive takes the session menu's warning tone.
  const readAction: SwipeAction = unread
    ? { key: "read", label: "Mark as read", icon: IconMailOpened, onPress: onToggleRead }
    : { key: "unread", label: "Mark as unread", icon: IconMail, onPress: onToggleRead };
  const archiveAction: SwipeAction = archived
    ? { key: "unarchive", label: "Unarchive", icon: IconArchiveOff, onPress: onToggleArchive, exits: true }
    : { key: "archive", label: "Archive", icon: IconArchive, tone: "warning", onPress: onToggleArchive, exits: true };
  return (
    <SwipeableRow leadingActions={[readAction]} trailingActions={[archiveAction]} enabled={!selection}>
      <View className="flex-row items-center gap-3 px-4">
        {selection ? (
          <Checkbox
            checked={selection.checked}
            onCheckedChange={selection.onToggle}
            accessibilityLabel={`Select ${subject}`}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subject}
          {...(selection ? null : swipeActionsAccessibility([readAction, archiveAction]))}
          onPress={selection ? selection.onToggle : onPress}
          className="min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-70"
        >
          <View className="w-1.5 items-center">
            {unread ? (
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.primary[scheme] }} />
            ) : null}
          </View>
          {repo ? (
            <RepoMark repo={repo} />
          ) : (
            // The web `NotificationIcon`: a bordered 32 avatar with the tone tint
            // inside. The web `bg-surface-secondary` is `--muted`.
            <Avatar size={32} style={{ backgroundColor: EVA_THEME[scheme].muted }}>
              <AvatarFallback style={{ backgroundColor: tone.tint }}>
                <Glyph size={16} color={tone.glyph} />
              </AvatarFallback>
            </Avatar>
          )}
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              className={emphasised ? "font-instrument-sans-medium text-sm" : "font-instrument-sans text-sm"}
              style={emphasised ? { color: tokens.color.foreground[scheme], fontWeight: "500" } : { color: muted }}
            >
              {subject}
            </Text>
            {detail ? (
              <Text
                numberOfLines={1}
                className="font-instrument-sans text-xs leading-relaxed"
                style={{ color: muted, letterSpacing: XS_TRACKING }}
              >
                {detail}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Text
          className="font-instrument-sans text-xs"
          style={{ color: muted, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
        >
          {timeAgo(notification.createdAt)}
        </Text>
        <Glyph size={16} color={tone.glyph} accessibilityLabel={appearance.label} />
        {unread && !selection ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark as read"
            onPress={onMarkRead}
            hitSlop={4}
            className="h-10 w-10 items-center justify-center active:opacity-70"
          >
            <IconCheck size={16} color={muted} />
          </Pressable>
        ) : null}
      </View>
    </SwipeableRow>
  );
}

/** The web `RepoLogo` at 28: the uploaded logo, else the repo initial on the muted fill. */
function RepoMark({ repo }: { repo: NotificationRepo }) {
  const scheme = useScheme();
  return (
    <RepoLogo
      logoUrl={repo.logoUrl}
      size={28}
      fallback={
        <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: EVA_THEME[scheme].muted }}>
          <Text className="font-instrument-sans-semibold text-xs" style={{ color: tokens.color.muted[scheme], fontWeight: "600" }}>
            {repo.label.charAt(0).toUpperCase()}
          </Text>
        </View>
      }
    />
  );
}
