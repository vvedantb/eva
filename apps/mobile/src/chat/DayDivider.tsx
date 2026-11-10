import { formatClockTime, formatDayLabel } from "@eva/shared/dayLabel";
import { META_TEXT_STYLE } from "@vvedantb/native-ui/ai";
import { tokens, withAlpha } from "@vvedantb/native-ui/theme";
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
  const muted = tokens.color.muted[scheme];
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
