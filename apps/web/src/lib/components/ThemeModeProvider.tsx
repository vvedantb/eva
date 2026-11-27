import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { isThemeMode, themeAppearance } from "@eva/shared";
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
import { catchMutationError } from "@/lib/utils/mutationToast";

function getSystemAppearance(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyAppearance(appearance: ThemeAppearance, mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle(
    "dark",
    appearance === "dark" || appearance === "neutral",
  );
  root.classList.toggle("neutral", appearance === "neutral");
  writeThemeAppearanceHint(appearance, mode);
}

function readInitialTheme(): ThemeMode {
  const { mode, appearance } = readThemeHintSeed();
  if (mode) return mode;
  if (appearance) return appearance;
  try {
    const legacy = localStorage.getItem("theme");
    if (legacy && isThemeMode(legacy)) return legacy;
  } catch {
  }
  return "light";
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const syncedTheme = useQuery(
    api.auth.getTheme,
    isAuthenticated ? {} : "skip",
  );
  const setThemeMutation = useMutation(api.auth.setTheme).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(api.auth.getTheme, {}, args.theme);
    },
  );
  const [hintTheme, setHintTheme] = useState<ThemeMode>(readInitialTheme);
  const [previewTheme, setPreviewTheme] = useState<ThemeMode | null>(null);
  const theme: ThemeMode = previewTheme ?? syncedTheme ?? hintTheme;
  const [systemAppearance, setSystemAppearance] = useState(getSystemAppearance);
  const appearance: ThemeAppearance = themeAppearance(theme, systemAppearance);
  const resolvedTheme = appearanceToResolvedTheme(appearance);

  const setTheme = (t: ThemeMode) => {
    applyAppearance(themeAppearance(t, systemAppearance), t);
    if (!isAuthenticated) {
      setHintTheme(t);
      return;
    }
    void catchMutationError(
      setThemeMutation({ theme: t }),
      "Couldn't save theme",
      "theme-mode",
    );
  };

  useEffect(() => {
    applyAppearance(appearance, theme);
  }, [appearance, theme]);

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
      value={{ theme, appearance, resolvedTheme, setTheme, setPreviewTheme }}
    >
      {children}
    </ThemeModeContext.Provider>
  );
}
