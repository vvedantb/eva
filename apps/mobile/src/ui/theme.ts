import type { ThemeAppearance } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { useColorScheme } from "nativewind";
import { useThemeMode } from "@/settings/themeMode";

/**
 * The look on screen, an `EVA_THEME` key: light, dark or neutral. Neutral is
 * dark-family (NativeWind and the kit see "dark"), so test `!== "light"` for
 * "is dark". App code reads its colours from `EVA_THEME[scheme]`, never from
 * the kit's `tokens` / `palette` pairs: those only have a dark slot, and a
 * value memoised on "dark" would not follow a Dark to Neutral pick.
 */
export type Scheme = ThemeAppearance;

/** The web `text-xs` letter spacing (0.005em of 12, from the `@vvedantb/ui` type scale), in points. */
export const XS_TRACKING = 0.06;

/** The look on screen: NativeWind's scheme, with Neutral when it is the mode. */
export function useScheme(): Scheme {
  const mode = useThemeMode();
  if (useColorScheme().colorScheme !== "dark") return "light";
  return mode === "neutral" ? "neutral" : "dark";
}

/** Navigator colours from Eva's theme, as the native-ui tokens, so screens and cards match. */
export function navigationTheme(scheme: Scheme): Theme {
  const base = scheme === "light" ? DefaultTheme : DarkTheme;
  const theme = EVA_THEME[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      background: theme.background,
      card: theme.card,
      text: theme.foreground,
      border: theme.border,
    },
  };
}

/** Text colours for app copy (native-ui README: colours as styles, not classes). */
export function textColor(
  scheme: Scheme,
  tone: "foreground" | "muted" = "foreground",
) {
  return { color: EVA_THEME[scheme][tone === "muted" ? "mutedForeground" : "foreground"] };
}
