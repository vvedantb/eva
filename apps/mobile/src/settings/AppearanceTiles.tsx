import type { ThemeMode } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCheck, IconCircleHalf, IconDeviceDesktop, IconMoon, IconSun, type IconProps } from "@tabler/icons-react-native";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useScheme } from "@/ui/theme";
import { useSetThemeMode, useThemeMode } from "./themeMode";

/** Web `bg-zinc-900`. */
const ZINC_900 = "#18181b";

/**
 * The web `AppearanceSection` tiles at phone width: a swatch with the mode
 * icon over the label; the active tile gets the border, a primary wash and a
 * check badge on the swatch corner. The web's four modes in its order, in one
 * row that they share evenly (the web pairs them up below 640 px wide; at
 * 390 pt each tile is 76 pt wide and 102 pt high).
 */
const MODES: ReadonlyArray<{
  mode: ThemeMode;
  label: string;
  icon: ComponentType<IconProps>;
  /** A fixed web colour; none for the web `text-muted-foreground` of the scheme. */
  iconColor?: string;
  /** The swatch fill (web `bg-white`, `bg-zinc-700`, `bg-zinc-900`); none for the System gradient. */
  swatch?: string;
}> = [
  // Web icon colours: text-amber-500, text-zinc-300, text-blue-300, muted.
  { mode: "light", label: "Light", icon: IconSun, iconColor: "#f59e0b", swatch: "#ffffff" },
  { mode: "neutral", label: "Neutral", icon: IconCircleHalf, iconColor: "#d4d4d8", swatch: "#3f3f46" },
  { mode: "dark", label: "Dark", icon: IconMoon, iconColor: "#93c5fd", swatch: ZINC_900 },
  { mode: "system", label: "System", icon: IconDeviceDesktop },
];

/** The web System swatch, `bg-linear-to-br from-white to-zinc-900`. */
function GradientSwatch() {
  return (
    // Sized by props too: an unsized Svg is 300 wide and would widen the tile.
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
    // The web 8 gap (`gap-2`).
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
            {/* Web `rounded-lg` is 16 in Eva. The web `p-3` sides are on the swatch (`mx-2` in the tile's
                `px-1`), so the label below may use them. */}
            <View
              className="mx-2 h-12 items-center self-stretch justify-center overflow-hidden rounded-2xl"
              style={swatch ? { backgroundColor: swatch } : undefined}
            >
              {swatch ? null : <GradientSwatch />}
              {/* Positioned, so the web build paints it over the positioned gradient. */}
              <View className="absolute inset-0 items-center justify-center">
                <Icon size={22} color={iconColor ?? EVA_THEME[scheme].mutedForeground} />
              </View>
            </View>
            {/* After the swatch, so it draws on top of the swatch corner as on the web. */}
            {active ? (
              <View
                className="absolute right-2 top-2 h-4 w-4 items-center justify-center rounded-full"
                style={{ backgroundColor: EVA_THEME[scheme].primary }}
              >
                <IconCheck size={10} strokeWidth={3} color={EVA_THEME[scheme].primaryForeground} />
              </View>
            ) : null}
            {/* `text-sm` (web `text-xs`): a tappable title. The muted colour off the pick stays, as it marks the choice.
                With the swatch's side room, "Neutral" fits at 1.3x font scale on a 390 pt phone; past that
                (a 360 dp phone at a large scale) it shrinks to fit, not wraps. */}
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
