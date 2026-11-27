"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useThemeMode, type ThemeMode } from "@/lib/hooks/useThemeMode";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { DEFAULT_ACCENT_COLOR, api } from "@eva/backend";
import { writeCustomThemeHint } from "@/lib/contexts/themeHint";
import { catchMutationError } from "@/lib/utils/mutationToast";
import {
  FONT_FAMILIES,
  LETTER_SPACING_VALUES,
  RADIUS_VALUES,
  lookupAccent,
  type CustomTheme,
} from "@/lib/contexts/themeTokens";
import { ensureGoogleFont } from "@/lib/contexts/googleFonts";
import { ThemeStateContext } from "@/lib/contexts/useThemeContext";

export type {
  AccentColor,
  RadiusSize,
  FontFamily,
  LetterSpacing,
  CustomTheme,
} from "@/lib/contexts/themeTokens";

function nextCycledTheme(
  theme: ThemeMode,
  appearance: "light" | "neutral" | "dark",
): "light" | "neutral" | "dark" {
  const current = theme === "system" ? appearance : theme;
  if (current === "light") return "neutral";
  if (current === "neutral") return "dark";
  return "light";
}

function clearAccentOverride() {
  const el = document.getElementById("custom-theme-accent");
  if (el) el.remove();
}

function applyCustomThemeVars(customTheme: CustomTheme, _isDark: boolean) {
  const accentColor = customTheme.accentColor ?? DEFAULT_ACCENT_COLOR;
  const radius = customTheme.radius ?? "xl";
  const fontFamily = customTheme.fontFamily ?? "inter";
  const letterSpacing = customTheme.letterSpacing ?? "tight";

  ensureGoogleFont(fontFamily);

  document.documentElement.style.setProperty("--radius", RADIUS_VALUES[radius]);

  document.documentElement.style.setProperty(
    "--font-sans",
    FONT_FAMILIES[fontFamily].stack,
  );

  document.documentElement.style.setProperty(
    "--tracking-normal",
    LETTER_SPACING_VALUES[letterSpacing].value,
  );

  writeCustomThemeHint({
    accentColor,
    radius,
    fontFamily,
    letterSpacing,
  });

  if (accentColor === "zinc") {
    clearAccentOverride();
    return;
  }

  const colors = lookupAccent(accentColor);
  if (colors === undefined) {
    clearAccentOverride();
    return;
  }

  const existing = document.getElementById("custom-theme-accent");
  let styleEl: HTMLStyleElement;
  if (existing instanceof HTMLStyleElement) {
    styleEl = existing;
  } else {
    styleEl = document.createElement("style");
    styleEl.id = "custom-theme-accent";
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    :root {
      --accent: ${colors.light.primary};
      --accent-foreground: ${colors.light.foreground};
      --accent-soft: ${colors.light.accent};
      --accent-soft-foreground: ${colors.light.accentFg};
    }
    .dark {
      --accent: ${colors.dark.primary};
      --accent-foreground: ${colors.dark.foreground};
      --accent-soft: ${colors.dark.accent};
      --accent-soft-foreground: ${colors.dark.accentFg};
    }
  `;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, appearance, setTheme } = useThemeMode();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const syncedCustomTheme = useQuery(api.auth.getCustomTheme);
  const setCustomThemeMutation = useMutation(
    api.auth.setCustomTheme,
  ).withOptimisticUpdate((localStore, args) => {
    localStore.setQuery(api.auth.getCustomTheme, {}, args.customTheme);
  });

  useEffect(() => {
    if (syncedCustomTheme === undefined) return;
    const customTheme = syncedCustomTheme ?? {};
    applyCustomThemeVars(customTheme, appearance !== "light");
  }, [syncedCustomTheme, appearance]);

  const toggleTheme = () => {
    setTheme(nextCycledTheme(theme, appearance));
  };

  const setCustomTheme = (customTheme: CustomTheme) => {
    applyCustomThemeVars(customTheme, appearance !== "light");
    void catchMutationError(
      setCustomThemeMutation({ customTheme }),
      "Couldn't save theme",
      "theme-custom",
    );
  };

  const customTheme: CustomTheme = syncedCustomTheme ?? {};

  return (
    <ThemeStateContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        mounted,
        customTheme,
        setCustomTheme,
      }}
    >
      {children}
    </ThemeStateContext.Provider>
  );
}
