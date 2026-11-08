import type { Doc } from "@eva/backend";
import { splitNotificationTitle } from "@eva/shared/notificationTitle";
import { IconCheck } from "@tabler/icons-react-native";
import { Checkbox } from "@vvedantb/native-ui/primitives";
import { palette, tokens } from "@vvedantb/native-ui/theme";
import { Pressable, Text, View } from "react-native";
import { timeAgo } from "@/ui/format";
import { useScheme } from "@/ui/theme";
import { NOTIFICATION_APPEARANCE, type NotificationTone } from "./notificationAppearance";

/**
 * One inbox row, as Eva's web `NotificationRow` at phone width: a 6-wide unread
 * dot slot, the repo initial in a 28 circle, the subject (medium when unread)
 * over the event line, the time, the type glyph, and a 40 check that marks an
 * unread row read. Flat; `DividedList` draws the hairlines.
 */
export function NotificationRow({
  notification,
  repoLabel,
  onPress,
  onMarkRead,
  selection,
}: {
  notification: Doc<"notifications">;
  repoLabel: string | undefined;
  onPress: () => void;
  onMarkRead: () => void;
  /** Select mode, as the web: a checkbox leads the row, a press toggles it, and Mark read hides. */
  selection?: { checked: boolean; onToggle: () => void };
}) {
  const scheme = useScheme();
  const muted = tokens.color.muted[scheme];
  const unread = !notification.read;
  // A low-urgency row reads as already read even while unread, as on the web.
  const emphasised = unread && notification.urgency !== "low";
  const { subject, event } = splitNotificationTitle(notification);
  const appearance = NOTIFICATION_APPEARANCE[notification.type];
  const Glyph = appearance.icon;
  const toneColor: Record<NotificationTone, string> = {
    primary: palette.primary[scheme],
    success: palette.success[scheme],
    warning: palette.warning[scheme],
    danger: palette.danger[scheme],
    muted,
  };
  return (
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
        onPress={selection ? selection.onToggle : onPress}
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-70"
      >
        <View className="w-1.5 items-center">
          {unread ? <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.primary[scheme] }} /> : null}
        </View>
        <View
          className="h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: tokens.color.surfaceSecondary[scheme] }}
        >
          <Text className="font-instrument-sans-semibold text-xs" style={{ color: muted, fontWeight: "600" }}>
            {(repoLabel ?? appearance.label).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className={emphasised ? "font-instrument-sans-medium text-sm" : "font-instrument-sans text-sm"}
            style={emphasised ? { color: tokens.color.foreground[scheme], fontWeight: "500" } : { color: muted }}
          >
            {subject}
          </Text>
          {event ? (
            <Text numberOfLines={1} className="font-instrument-sans text-xs leading-relaxed" style={{ color: muted }}>
              {event}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Text className="font-instrument-sans text-xs" style={{ color: muted, fontVariant: ["tabular-nums"] }}>
        {timeAgo(notification.createdAt)}
      </Text>
      <Glyph size={16} color={toneColor[appearance.tone]} accessibilityLabel={appearance.label} />
      {unread && !selection ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark as read"
          onPress={onMarkRead}
          hitSlop={4}
          className="h-10 w-10 items-center justify-center active:opacity-70"
        >
          <IconCheck size={14} color={muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
