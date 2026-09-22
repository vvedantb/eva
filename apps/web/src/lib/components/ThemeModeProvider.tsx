import { useEffect, useState } from "react";
import {
  ThemeModeContext,
  appearanceToResolvedTheme,
  type ThemeAppearance,
  type ThemeMode,
} from "@/lib/hooks/useThemeMode";
import {
  readThemeHintSeed,
  writeThemeAppearanceHint,
} from "@/lib/contexts/themeHint";

function getSystemAppearance(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Apply DOM classes for the resolved appearance.
 * Neutral is dark-family: `class="dark neutral"` so Tailwind `dark:` keeps working
 * while `.dark.neutral` surface tokens lift the near-black Dark palette.
 */
function applyAppearance(appearance: ThemeAppearance, mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle(
    "dark",
    appearance === "dark" || appearance === "neutral",
  );
  root.classList.toggle("neutral", appearance === "neutral");
  writeThemeAppearanceHint(appearance, mode);
}

function isValidTheme(value: string): value is ThemeMode {
  return (
    value === "dark" ||
    value === "light" ||
    value === "neutral" ||
    value === "system"
  );
}

/**
 * Seed in-memory theme from the FOUC hint (or legacy `theme` key) so the first
 * client render matches index.html. Convex remains source of truth via
 * ThemeProvider — we no longer persist preference to localStorage `"theme"`.
 *
 * The hint's `mode` is the preference, so System boots as System. Hints written
 * before `mode` existed only carry a resolved appearance, which is the best
 * available guess for them.
 */
function readInitialTheme(): ThemeMode {
  // readThemeHintSeed swallows its own parse / private-mode failures.
  const { mode, appearance } = readThemeHintSeed();
  if (mode) return mode;
  if (appearance) return appearance;
  try {
    const legacy = localStorage.getItem("theme");
    if (legacy && isValidTheme(legacy)) return legacy;
  } catch {
    // Ignore.
  }
  return "light";
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);
  // The OS preference lives in React state, not just the DOM: `appearance` and
  // `resolvedTheme` feed Sonner and the diff viewer, and they went stale when a
  // System user flipped their OS theme mid-session.
  const [systemAppearance, setSystemAppearance] = useState(getSystemAppearance);
  const appearance: ThemeAppearance =
    theme === "system" ? systemAppearance : theme;
  const resolvedTheme = appearanceToResolvedTheme(appearance);

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    applyAppearance(t === "system" ? systemAppearance : t, t);
  };

  useEffect(() => {
    applyAppearance(appearance, theme);
  }, [appearance, theme]);

  // matchMedia is a genuine external system, so it is read through an effect.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setSystemAppearance(getSystemAppearance());
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <ThemeModeContext.Provider
      value={{ theme, appearance, resolvedTheme, setTheme }}
    >
      {children}
    </ThemeModeContext.Provider>
  );
}
