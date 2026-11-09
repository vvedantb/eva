import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun, type IconProps } from "@tabler/icons-react-native";
import { palette, tokens, withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { setColorSchemeChoice, useColorSchemeChoice, type ColorSchemeChoice } from "./colorScheme";

/**
 * The web `AppearanceSection` tiles at phone width: two columns, a swatch with
 * the mode icon over the label; the active tile gets the border, a primary
 * wash and a check badge on the swatch corner. The web's Neutral theme has no
 * phone counterpart, so three tiles.
 */
const MODES: ReadonlyArray<{
  mode: ColorSchemeChoice;
  label: string;
  icon: ComponentType<IconProps>;
  iconColor: string;
  swatch: "light" | "dark" | "gradient";
}> = [
  // Web icon colours: text-amber-500, text-blue-300, muted.
  { mode: "light", label: "Light", icon: IconSun, iconColor: "#f59e0b", swatch: "light" },
  { mode: "dark", label: "Dark", icon: IconMoon, iconColor: "#93c5fd", swatch: "dark" },
  { mode: "system", label: "System", icon: IconDeviceDesktop, iconColor: "#71717a", swatch: "gradient" },
];

/** Web `bg-zinc-900`. */
const ZINC_900 = "#18181b";

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

/** Two columns with the 8 gap, as the web `grid-cols-2 gap-2`; the odd tile sits beside a spacer. */
const ROWS = [MODES.slice(0, 2), MODES.slice(2)];

export function AppearanceTiles() {
  const scheme = useScheme();
  const choice = useColorSchemeChoice();
  return (
    <View className="gap-2">
      {ROWS.map((row) => (
        <View key={row[0].mode} className="flex-row gap-2">
          {row.map(({ mode, label, icon: Icon, iconColor, swatch }) => {
            const active = choice === mode;
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                onPress={() => setColorSchemeChoice(mode)}
                className="flex-1 items-center gap-2 rounded-2xl border p-3 active:opacity-80"
                style={{
                  borderColor: active ? tokens.color.border[scheme] : "transparent",
                  backgroundColor: active
                    ? withAlpha(palette.primary[scheme], 0.08)
                    : withAlpha(EVA_THEME[scheme].muted, 0.4),
                }}
              >
                {/* Web `rounded-lg` is 16 in Eva. */}
                <View
                  className="h-12 w-full items-center justify-center overflow-hidden rounded-2xl"
                  style={
                    swatch === "gradient" ? undefined : { backgroundColor: swatch === "light" ? "#ffffff" : ZINC_900 }
                  }
                >
                  {swatch === "gradient" ? <GradientSwatch /> : null}
                  {/* Positioned, so the web build paints it over the positioned gradient. */}
                  <View className="absolute inset-0 items-center justify-center">
                    <Icon size={22} color={iconColor} />
                  </View>
                </View>
                {/* After the swatch, so it draws on top of the swatch corner as on the web. */}
                {active ? (
                  <View
                    className="absolute right-2 top-2 h-4 w-4 items-center justify-center rounded-full"
                    style={{ backgroundColor: palette.primary[scheme] }}
                  >
                    <IconCheck size={10} strokeWidth={3} color={palette.primaryForeground[scheme]} />
                  </View>
                ) : null}
                <Text
                  className="font-instrument-sans-medium text-xs"
                  style={{
                    fontWeight: "500",
                    letterSpacing: XS_TRACKING,
                    color: active ? palette.primary[scheme] : tokens.color.muted[scheme],
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
          {/* A tile's padding and border, so flex gives it a tile's width. */}
          {row.length === 1 ? <View className="flex-1 border border-transparent p-3" /> : null}
        </View>
      ))}
    </View>
  );
}
