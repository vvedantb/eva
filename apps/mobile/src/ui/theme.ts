import { tokens } from "@vvedantb/native-ui/theme";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { useColorScheme } from "nativewind";

export type Scheme = "light" | "dark";

/** The scheme every @vvedantb/native-ui component reads (NativeWind). */
export function useScheme(): Scheme {
  return useColorScheme().colorScheme === "dark" ? "dark" : "light";
}

/** Navigator colours from the native-ui tokens, so screens and cards match. */
export function navigationTheme(scheme: Scheme): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: tokens.color.background[scheme],
      card: tokens.color.surface[scheme],
      text: tokens.color.foreground[scheme],
      border: tokens.color.border[scheme],
    },
  };
}

/** Text colours for app copy (native-ui README: colours as styles, not classes). */
export function textColor(
  scheme: Scheme,
  tone: "foreground" | "muted" = "foreground",
) {
  return { color: tokens.color[tone][scheme] };
}
