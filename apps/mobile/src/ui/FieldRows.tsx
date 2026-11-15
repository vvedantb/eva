import { EVA_THEME } from "@eva/shared/evaTheme";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/** The web `FieldsSection`: a 14 medium muted title over its rows. */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <View className="mt-6 gap-0.5">
      <Text accessibilityRole="header" className="font-instrument-sans-medium px-2 pb-1 text-sm" style={{ color: muted, fontWeight: "500" }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** One field: its 16 icon and 14 value, 48 high. With `onPress` it is a button that opens the field's sheet. */
export function FieldRow({
  label,
  icon,
  value,
  color,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  value: string;
  color?: string;
  onPress?: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const content = (
    <>
      {icon}
      <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: color ?? theme.foreground }}>
        {value}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}: ${value}`} className="min-h-12 flex-row items-center gap-1.5 rounded-lg px-2">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-1.5 rounded-lg px-2 active:opacity-70"
    >
      {content}
    </Pressable>
  );
}
