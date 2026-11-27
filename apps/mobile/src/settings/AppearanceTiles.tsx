import type { ThemeMode } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCheck, IconCircleHalf, IconDeviceDesktop, IconMoon, IconSun, type IconProps } from "@tabler/icons-react-native";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useScheme } from "@/ui/theme";
import { useSetThemeMode, useThemeMode } from "./themeMode";

const ZINC_900 = "#18181b";

const MODES: ReadonlyArray<{
  mode: ThemeMode;
  label: string;
  icon: ComponentType<IconProps>;
  iconColor?: string;
  swatch?: string;
}> = [
  { mode: "light", label: "Light", icon: IconSun, iconColor: "#f59e0b", swatch: "#ffffff" },
  { mode: "neutral", label: "Neutral", icon: IconCircleHalf, iconColor: "#d4d4d8", swatch: "#3f3f46" },
  { mode: "dark", label: "Dark", icon: IconMoon, iconColor: "#93c5fd", swatch: ZINC_900 },
  { mode: "system", label: "System", icon: IconDeviceDesktop },
];

function GradientSwatch() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="system-swatch" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor={ZINC_900} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#system-swatch)" />
    </Svg>
  );
}

export function AppearanceTiles() {
  const scheme = useScheme();
  const choice = useThemeMode();
  const setMode = useSetThemeMode();
  return (
    <View className="flex-row gap-2">
      {MODES.map(({ mode, label, icon: Icon, iconColor, swatch }) => {
        const active = choice === mode;
        return (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => setMode(mode)}
            className="flex-1 items-center gap-2 rounded-2xl border px-1 py-3 active:opacity-80"
            style={{
              borderColor: active ? EVA_THEME[scheme].border : "transparent",
              backgroundColor: active
                ? withAlpha(EVA_THEME[scheme].primary, 0.08)
                : withAlpha(EVA_THEME[scheme].muted, 0.4),
            }}
          >
            <View
              className="mx-2 h-12 items-center self-stretch justify-center overflow-hidden rounded-2xl"
              style={swatch ? { backgroundColor: swatch } : undefined}
            >
              {swatch ? null : <GradientSwatch />}
              <View className="absolute inset-0 items-center justify-center">
                <Icon size={22} color={iconColor ?? EVA_THEME[scheme].mutedForeground} />
              </View>
            </View>
            {active ? (
              <View
                className="absolute right-2 top-2 h-4 w-4 items-center justify-center rounded-full"
                style={{ backgroundColor: EVA_THEME[scheme].primary }}
              >
                <IconCheck size={10} strokeWidth={3} color={EVA_THEME[scheme].primaryForeground} />
              </View>
            ) : null}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              className="font-instrument-sans-medium text-sm"
              style={{
                fontWeight: "500",
                color: active ? EVA_THEME[scheme].primary : EVA_THEME[scheme].mutedForeground,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
