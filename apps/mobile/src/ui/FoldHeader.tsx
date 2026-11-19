import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChevronRight, type IconProps } from "@tabler/icons-react-native";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * One web list section's header (a quick-task status, a project phase, a
 * project's task status): a 48 high button with a chevron that turns open,
 * the 16 icon and 14 label in the section's colour, and the count at 60%
 * muted, so it reads as a heading above its cards. `trailing` sits at the
 * end, outside the button (To Do's "Run" or "+"). Its rows follow, then
 * `FoldFooter`.
 */
export function FoldHeader({
  icon: Icon,
  color,
  label,
  count,
  noun,
  open,
  onToggle,
  trailing,
}: {
  icon: ComponentType<IconProps>;
  color: string;
  label: string;
  count: number;
  /** What the count counts, for the screen reader: "task" or "project". */
  noun: string;
  open: boolean;
  onToggle: () => void;
  trailing?: ReactNode;
}) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <View className="flex-row items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${count} ${count === 1 ? noun : `${noun}s`}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        className="min-h-12 flex-1 flex-row items-center gap-2 rounded-lg px-2 active:opacity-70"
      >
        <View style={open ? { transform: [{ rotate: "90deg" }] } : undefined}>
          <IconChevronRight size={16} color={muted} />
        </View>
        <Icon size={16} color={color} />
        <Text className="font-instrument-sans-medium text-sm" style={{ color, fontWeight: "500" }}>
          {label}
        </Text>
        <Text className="font-instrument-sans text-xs" style={{ color: withAlpha(muted, 0.6), fontVariant: ["tabular-nums"] }}>
          {count}
        </Text>
      </Pressable>
      {trailing}
    </View>
  );
}

/** Under a section: `empty` ("No tasks") when it is open and has no rows, the rows' `pb-1.5` when it has rows, then the web `space-y-1` to the next section. */
export function FoldFooter({ open, count, empty }: { open: boolean; count: number; empty: string }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  if (open && count === 0) {
    return (
      <Text className="font-instrument-sans mb-1 py-4 text-center text-xs" style={{ color: muted }}>
        {empty}
      </Text>
    );
  }
  return <View className={open ? "mb-1 pb-1.5" : "mb-1"} />;
}

/** The 8 between two cards in a section. */
export function CardGap() {
  return <View className="h-2" />;
}
