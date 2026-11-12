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
    segmentActive: "#ffffff",
    muted: "#efeff0",
    mutedForeground: "#646567",
    accent: "#f4f4f5",
    accentForeground: "#18181b",
    destructive: "#ff373c",
    destructiveForeground: "#fcfcfc",
    success: "#15c964",
    warning: "#f5a523",
    statusCodeReview: "#7e22ce",
    statusCodeReviewBar: "#c084fc",
    statusProgress: "#a16207",
    statusProgressBar: "#facc15",
    statusBusinessReview: "#c2410c",
    statusBusinessReviewBar: "#fb923c",
    statusDone: "#15803d",
    statusDoneBar: "#4ade80",
    statusCancelled: "#6b7280",
    statusCancelledBar: "#9ca3af",
    border: "#dddedf",
    input: "#dddedf",
    ring: "#09090b",
    // The muted categorical ramp (`--cat-1` … `--cat-8`): repo tiles, tab groups.
    cat1: "#486aa8", // blue
    cat2: "#7860aa", // violet
    cat3: "#367a76", // teal
    cat4: "#966c2a", // amber
    cat5: "#a05264", // rose
    cat6: "#3e7a54", // emerald
    cat7: "#387096", // sky
    cat8: "#a2603e", // orange
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
    segmentActive: "#474747",
    muted: "#1a1a1a",
    mutedForeground: "#9fa0a2",
    accent: "#141414",
    accentForeground: "#f4f4f5",
    destructive: "#db3b3e",
    destructiveForeground: "#fcfcfc",
    success: "#15c964",
    warning: "#f7b750",
    statusCodeReview: "#c084fc",
    statusCodeReviewBar: "#a855f7",
    statusProgress: "#facc15",
    statusProgressBar: "#f59e0b",
    statusBusinessReview: "#fb923c",
    statusBusinessReviewBar: "#f97316",
    statusDone: "#4ade80",
    statusDoneBar: "#22c55e",
    statusCancelled: "#9ca3af",
    statusCancelledBar: "#6b7280",
    border: "#242424",
    input: "#242424",
    ring: "#fafafa",
    // The muted categorical ramp (`--cat-1` … `--cat-8`): repo tiles, tab groups.
    cat1: "#8aa5d6", // blue
    cat2: "#aa98d6", // violet
    cat3: "#78b0ac", // teal
    cat4: "#caa060", // amber
    cat5: "#d28e9e", // rose
    cat6: "#7eb290", // emerald
    cat7: "#80acc8", // sky
    cat8: "#d49876", // orange
  },
} as const;

export type EvaThemeScheme = keyof typeof EVA_THEME;
