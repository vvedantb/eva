"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useThemeMode, type ThemeMode } from "@/lib/hooks/useThemeMode";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
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

/** Next Light → Neutral → Dark → Light. System uses resolved appearance as the start. */
function nextCycledTheme(
  theme: ThemeMode,
  appearance: "light" | "neutral" | "dark",
): "light" | "neutral" | "dark" {
  const current = theme === "system" ? appearance : theme;
  if (current === "light") return "neutral";
  if (current === "neutral") return "dark";
  return "light";
}

/** Drops the injected accent stylesheet so `globals.css` supplies the accent. */
function clearAccentOverride() {
  const el = document.getElementById("custom-theme-accent");
  if (el) el.remove();
}

function applyCustomThemeVars(customTheme: CustomTheme, _isDark: boolean) {
  const accentColor = customTheme.accentColor ?? "zinc";
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

  // Persist hint so the next document paint can apply fonts/radius before React.
  // Appearance is owned by ThemeModeProvider / Convex.
  writeCustomThemeHint({
    accentColor,
    radius,
    fontFamily,
    letterSpacing,
  });

  // Zinc matches globals.css — drop the override style so base CSS applies.
  if (accentColor === "zinc") {
    clearAccentOverride();
    return;
  }

  const colors = lookupAccent(accentColor);
  // An accent this build does not define. Fall back to the CSS default instead
  // of throwing on `colors.light`. See `lookupAccent` for why and for how to
  // remove this.
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
      --primary: ${colors.light.primary};
      --primary-foreground: ${colors.light.foreground};
      --ring: ${colors.light.primary};
      --chart-1: ${colors.light.primary};
      --accent: ${colors.light.accent};
      --accent-foreground: ${colors.light.accentFg};
      --sidebar-primary: ${colors.light.primary};
      --sidebar-primary-foreground: ${colors.light.foreground};
      --sidebar-ring: ${colors.light.primary};
      --sidebar-accent-foreground: ${colors.light.accentFg};
    }
    .dark,
    .dark.neutral {
      --primary: ${colors.dark.primary};
      --primary-foreground: ${colors.dark.foreground};
      --ring: ${colors.dark.primary};
      --chart-1: ${colors.dark.primary};
      --accent: ${colors.dark.accent};
      --accent-foreground: ${colors.dark.accentFg};
      --sidebar-primary: ${colors.dark.primary};
      --sidebar-primary-foreground: ${colors.dark.foreground};
      --sidebar-ring: ${colors.dark.primary};
      --sidebar-accent-foreground: ${colors.dark.accentFg};
    }
  `;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, appearance, setTheme: setNextTheme } = useThemeMode();
  // Client-only gate without setState-in-effect (SSR snapshot = false).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const syncedTheme = useQuery(api.auth.getTheme);
  const setThemeMutation = useMutation(api.auth.setTheme).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(api.auth.getTheme, {}, args.theme);
    },
  );
  const syncedCustomTheme = useQuery(api.auth.getCustomTheme);
  const setCustomThemeMutation = useMutation(
    api.auth.setCustomTheme,
  ).withOptimisticUpdate((localStore, args) => {
    localStore.setQuery(api.auth.getCustomTheme, {}, args.customTheme);
  });

  useEffect(() => {
    if (syncedTheme === undefined || syncedTheme === null) return;
    if (syncedTheme !== theme) {
      setNextTheme(syncedTheme);
    }
  }, [syncedTheme]);

  useEffect(() => {
    if (syncedCustomTheme === undefined) return;
    const customTheme = syncedCustomTheme ?? {};
    // Neutral is dark-family — accent `.dark` rules apply via the `dark` class.
    applyCustomThemeVars(customTheme, appearance !== "light");
  }, [syncedCustomTheme, appearance]);

  // Every mode persists, System included — it is a preference ("follow the OS"),
  // not a resolved appearance, so it has to survive a reload like the others.
  const setTheme = (next: ThemeMode) => {
    setNextTheme(next);
    void catchMutationError(
      setThemeMutation({ theme: next }),
      "Couldn't save theme",
      "theme-mode",
    );
  };

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
