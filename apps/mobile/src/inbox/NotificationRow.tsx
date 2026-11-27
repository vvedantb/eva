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
import { Pressable, Text, View } from "react-native";
import { timeAgo } from "@/ui/format";
import { RepoLogo } from "@/ui/RepoLogo";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { NOTIFICATION_ICONS, toneColors } from "./notificationAppearance";

export type NotificationRepo = { label: string; logoUrl?: string | null };

/**
 * One inbox row, as Eva's web `NotificationRow` at phone width: a 6-wide unread
 * dot slot, the source mark (the repo logo or initial, else the type glyph in a
 * 32 tinted circle), the subject (medium when unread) over the event line, the
 * time, the type glyph in its tone, and a 40 check that marks an unread row
 * read. Flat; `DividedList` draws the hairlines. The web right-click menu is
 * a swipe: right to mark read or unread, left to archive or unarchive (the
 * row slides out). Screen readers get both as row actions. Off in select mode.
 * A long press starts select mode with this row ticked, as Gmail; in select
 * mode it ticks, as a tap. The swipe's Gesture Handler pan takes the touch
 * from the press once it moves sideways, and the press drops its long press
 * once the finger moves, so neither counts as the other.
 */
export function NotificationRow({
  notification,
  repo,
  onOpen,
  onMarkRead,
  onToggleRead,
  onToggleArchive,
  onStartSelect,
  selection,
}: {
  notification: Doc<"notifications">;
  repo: NotificationRepo | undefined;
  onOpen: (notification: Doc<"notifications">) => void;
  onMarkRead: (notification: Doc<"notifications">) => void;
  onToggleRead: (notification: Doc<"notifications">) => void;
  onToggleArchive: (notification: Doc<"notifications">) => Promise<unknown>;
  onStartSelect: (notification: Doc<"notifications">) => void;
  selection?: { checked: boolean; onToggle: (notification: Doc<"notifications">) => void };
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const unread = !notification.read;
  const emphasised = unread && notification.urgency !== "low";
  const parts = splitNotificationTitle(notification);
  const appearance = getNotificationAppearance(notification);
  const subject = parts.subject || appearance.label;
  const event = parts.event;
  const detail = event ?? repo?.label;
  const Glyph = NOTIFICATION_ICONS[appearance.icon];
  const tone = toneColors(appearance.tone, scheme);
  const archived = notification.archivedAt !== undefined;
  const press = () => (selection ? selection.onToggle(notification) : onOpen(notification));
  const longPress = () => (selection ? selection.onToggle(notification) : onStartSelect(notification));
  const toggleRead = () => onToggleRead(notification);
  const toggleArchive = () => onToggleArchive(notification);
  const readAction: SwipeAction = unread
    ? { key: "read", label: "Mark as read", icon: IconMailOpened, onPress: toggleRead }
    : { key: "unread", label: "Mark as unread", icon: IconMail, onPress: toggleRead };
  const archiveAction: SwipeAction = archived
    ? { key: "unarchive", label: "Unarchive", icon: IconArchiveOff, onPress: toggleArchive, exits: true }
    : { key: "archive", label: "Archive", icon: IconArchive, tone: "warning", onPress: toggleArchive, exits: true };
  return (
    <SwipeableRow leadingActions={[readAction]} trailingActions={[archiveAction]} enabled={!selection}>
      <View className="flex-row items-center gap-3 px-4">
        {selection ? (
          <Checkbox
            checked={selection.checked}
            onCheckedChange={() => selection.onToggle(notification)}
            accessibilityLabel={`Select ${subject}`}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subject}
          {...(selection ? null : swipeActionsAccessibility([readAction, archiveAction]))}
          onPress={press}
          onLongPress={longPress}
          className="min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-70"
        >
          <View className="w-1.5 items-center">
            {unread ? (
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EVA_THEME[scheme].primary }} />
            ) : null}
          </View>
          {repo ? (
            <RepoMark repo={repo} />
          ) : (
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
              style={emphasised ? { color: EVA_THEME[scheme].foreground, fontWeight: "500" } : { color: muted }}
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
            onPress={() => onMarkRead(notification)}
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

function RepoMark({ repo }: { repo: NotificationRepo }) {
  const scheme = useScheme();
  return (
    <RepoLogo
      logoUrl={repo.logoUrl}
      size={28}
      fallback={
        <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: EVA_THEME[scheme].muted }}>
          <Text className="font-instrument-sans-semibold text-xs" style={{ color: EVA_THEME[scheme].mutedForeground, fontWeight: "600" }}>
            {repo.label.charAt(0).toUpperCase()}
          </Text>
        </View>
      }
    />
  );
}
