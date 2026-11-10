import { IconCheck, IconDeviceDesktop, IconMoon, IconSun, type IconProps } from "@tabler/icons-react-native";
import { palette, tokens, withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";
import { setColorSchemeChoice, useColorSchemeChoice, type ColorSchemeChoice } from "./colorScheme";

/**
 * The web `AppearanceSection` tiles: a swatch with the mode icon over the
 * label; the active tile gets the border, a primary wash and a check badge.
 * The web's Neutral theme has no phone counterpart, so three tiles.
 */
const MODES: ReadonlyArray<{
  mode: ColorSchemeChoice;
  label: string;
  icon: ComponentType<IconProps>;
  iconColor: string;
  swatch: "light" | "dark" | "split";
}> = [
  // Web icon colours: text-amber-500, text-blue-300, muted.
  { mode: "light", label: "Light", icon: IconSun, iconColor: "#f59e0b", swatch: "light" },
  { mode: "dark", label: "Dark", icon: IconMoon, iconColor: "#93c5fd", swatch: "dark" },
  { mode: "system", label: "System", icon: IconDeviceDesktop, iconColor: "#71717a", swatch: "split" },
];

/** Web `bg-zinc-900`. */
const ZINC_900 = "#18181b";

export function AppearanceTiles() {
  const scheme = useScheme();
  const choice = useColorSchemeChoice();
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
            onPress={() => setColorSchemeChoice(mode)}
            className="flex-1 items-center gap-2 rounded-2xl border p-3 active:opacity-80"
            style={{
              borderColor: active ? tokens.color.border[scheme] : "transparent",
              backgroundColor: active
                ? withAlpha(palette.primary[scheme], 0.08)
                : withAlpha(tokens.color.surfaceSecondary[scheme], 0.4),
            }}
          >
            {active ? (
              <View
                className="absolute right-2 top-2 h-4 w-4 items-center justify-center rounded-full"
                style={{ backgroundColor: palette.primary[scheme] }}
              >
                <IconCheck size={10} strokeWidth={3} color={palette.primaryForeground[scheme]} />
              </View>
            ) : null}
            <View className="h-12 w-full flex-row overflow-hidden rounded-lg">
              {swatch === "split" ? (
                <>
                  <View className="flex-1" style={{ backgroundColor: "#ffffff" }} />
                  <View className="flex-1" style={{ backgroundColor: ZINC_900 }} />
                </>
              ) : (
                <View className="flex-1" style={{ backgroundColor: swatch === "light" ? "#ffffff" : ZINC_900 }} />
              )}
              <View className="absolute inset-0 items-center justify-center">
                <Icon size={22} color={iconColor} />
              </View>
            </View>
            <Text
              className="font-instrument-sans-medium text-xs"
              style={{ fontWeight: "500", color: active ? palette.primary[scheme] : tokens.color.muted[scheme] }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
