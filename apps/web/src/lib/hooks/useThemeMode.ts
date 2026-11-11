import { createContext, useContext } from "react";

/** User preference. Every mode, System included, is persisted to Convex. */
export type ThemeMode = "light" | "neutral" | "dark" | "system";

/** Resolved appearance applied to the DOM (`dark neutral` for Neutral). */
export type ThemeAppearance = "light" | "neutral" | "dark";

/** Third-party APIs (Sonner, diffs) only know light/dark — Neutral maps to dark. */
export type ResolvedTheme = "light" | "dark";

export interface ThemeModeContextValue {
  theme: ThemeMode;
  /** DOM appearance after resolving System. */
  appearance: ThemeAppearance;
  /** light/dark for libraries; Neutral → dark. */
  resolvedTheme: ResolvedTheme;
  /** Saves the preference (to Convex when signed in). */
  setTheme: (theme: ThemeMode) => void;
  /** Pins a theme for the current page without saving it; `null` releases it. */
  setPreviewTheme: (theme: ThemeMode | null) => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue>({
  theme: "light",
  appearance: "light",
  resolvedTheme: "light",
  setTheme: () => {},
  setPreviewTheme: () => {},
});

export function useThemeMode(): ThemeModeContextValue {
  return useContext(ThemeModeContext);
}

export function appearanceToResolvedTheme(
  appearance: ThemeAppearance,
): ResolvedTheme {
  return appearance === "light" ? "light" : "dark";
}
