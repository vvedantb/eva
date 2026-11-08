/**
 * Eva's web theme colours (apps/web/src/globals.css, the light and dark
 * blocks), as hex, so the mobile app can paint with the same values. Keep in
 * step with globals.css; the names follow its CSS variables.
 */
export const EVA_THEME = {
  light: {
    background: "#f4f5f6",
    foreground: "#09090b",
    card: "#ffffff",
    popover: "#ffffff",
    popoverForeground: "#09090b",
    primary: "#09090b",
    primaryForeground: "#fafafa",
    secondary: "#eaebec",
    secondaryForeground: "#17191b",
    muted: "#efeff0",
    mutedForeground: "#646567",
    accent: "#f4f4f5",
    destructive: "#ff373c",
    destructiveForeground: "#fcfcfc",
    success: "#15c964",
    warning: "#f5a523",
    border: "#dddedf",
    input: "#dddedf",
    ring: "#09090b",
  },
  dark: {
    background: "#020202",
    foreground: "#fafafa",
    card: "#101010",
    popover: "#101010",
    popoverForeground: "#fafafa",
    primary: "#fafafa",
    primaryForeground: "#09090b",
    secondary: "#202020",
    secondaryForeground: "#fcfcfc",
    muted: "#1a1a1a",
    mutedForeground: "#9fa0a2",
    accent: "#141414",
    destructive: "#db3b3e",
    destructiveForeground: "#fcfcfc",
    success: "#15c964",
    warning: "#f7b750",
    border: "#242424",
    input: "#242424",
    ring: "#fafafa",
  },
} as const;

export type EvaThemeScheme = keyof typeof EVA_THEME;
