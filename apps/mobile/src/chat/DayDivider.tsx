import { formatClockTime, formatDayLabel } from "@eva/shared/dayLabel";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { META_TEXT_STYLE } from "@vvedantb/native-ui/ai";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * Eva's web `ChatDayDivider`: the day in medium weight beside the turn's time,
 * centred, `text-2xs` (11 / 16, as the message clock), muted at 70%. Text only.
 */
export function DayDivider({ timestamp }: { timestamp: number }) {
  const scheme = useScheme();
  const day = formatDayLabel(timestamp);
  const time = formatClockTime(timestamp);
  const muted = EVA_THEME[scheme].mutedForeground;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${day} ${time}`}
      className="flex-row justify-center gap-1 pb-1 pt-2"
    >
      <Text className="font-instrument-sans-medium" style={[META_TEXT_STYLE, { color: muted, fontWeight: "500" }]}>
        {day}
      </Text>
      <Text className="font-instrument-sans" style={[META_TEXT_STYLE, { color: withAlpha(muted, 0.7) }]}>
        {time}
      </Text>
    </View>
  );
}

/**
 * The web `ChatNewDivider`: where unseen replies start. Unlike the day line,
 * the rules stay, so it reads as a boundary ("everything below is new"): two
 * hairlines in the primary colour at 30% around "NEW" in primary, 11 medium,
 * uppercase and slightly tracked.
 */
export function NewDivider() {
  const primary = EVA_THEME[useScheme()].primary;
  return (
    <View accessibilityRole="text" accessibilityLabel="New messages" className="flex-row items-center gap-3 py-1">
      <View className="h-px flex-1" style={{ backgroundColor: withAlpha(primary, 0.3) }} />
      <Text className="font-instrument-sans-medium" style={[META_TEXT_STYLE, { color: primary, fontWeight: "500", letterSpacing: 0.4 }]}>
        NEW
      </Text>
      <View className="h-px flex-1" style={{ backgroundColor: withAlpha(primary, 0.3) }} />
    </View>
  );
}
