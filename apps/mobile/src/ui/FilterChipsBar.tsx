import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconX } from "@tabler/icons-react-native";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { Pressable, Text, View } from "react-native";
import { useScheme, XS_TRACKING } from "@/ui/theme";

/**
 * The web `ActiveFiltersBar` below `sm`: "Filtered by", then a 40-high chip
 * per active filter that clears it, and "Clear all" with two or more.
 * Nothing when no filter is on.
 */
export function FilterChipsBar<Key extends string>({
  chips,
  onClear,
  onClearAll,
}: {
  chips: ReadonlyArray<{ key: Key; label: string }>;
  onClear: (key: Key) => void;
  onClearAll: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const muted = theme.mutedForeground;
  if (chips.length === 0) return null;
  const textStyle = { color: muted, letterSpacing: XS_TRACKING };
  return (
    <View className="flex-row flex-wrap items-center gap-1.5 px-4 pb-2">
      <Text className="font-instrument-sans mr-0.5 text-xs" style={textStyle}>
        Filtered by
      </Text>
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${chip.label}`}
          onPress={() => onClear(chip.key)}
          // 40 high as the web chip below `sm`; 2 of slop above and below reach 44 without reaching a wrapped row 6 away.
          hitSlop={{ top: 2, bottom: 2 }}
          className="min-h-10 max-w-full flex-row items-center gap-1 rounded-md px-2 active:opacity-70"
          style={{ backgroundColor: withAlpha(theme.muted, 0.6) }}
        >
          <Text numberOfLines={1} className="font-instrument-sans shrink text-xs" style={textStyle}>
            {chip.label}
          </Text>
          <View style={{ opacity: 0.5 }}>
            <IconX size={12} color={muted} />
          </View>
        </Pressable>
      ))}
      {chips.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onClearAll}
          hitSlop={{ top: 2, bottom: 2 }}
          className="ml-1 min-h-10 justify-center active:opacity-70"
        >
          <Text className="font-instrument-sans text-xs" style={textStyle}>
            Clear all
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
