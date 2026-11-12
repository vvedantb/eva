import { api } from "@eva/backend";
import { isThemeMode, type ThemeMode } from "@eva/shared";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import { useEffect, useSyncExternalStore } from "react";
import { applyEvaTheme } from "@/ui/evaTheme";

/**
 * The appearance mode, as the web `ThemeModeProvider`: the account's saved
 * mode (`auth.getTheme`) once it loads, and this phone's last mode
 * (SecureStore) until then, so the app starts in it with no flash.
 */
const KEY = "eva.colorScheme";
let current: ThemeMode = "system";
/** True once the account or a pick set the mode: a slow SecureStore read must not undo it. */
let chosen = false;
const listeners = new Set<() => void>();

/**
 * Paints `mode` now. Neutral is the dark scheme with the Neutral palette in
 * the kit's dark slot (`applyEvaTheme`), set first so the redraw reads it.
 */
function apply(mode: ThemeMode) {
  current = mode;
  applyEvaTheme(mode === "neutral" ? "neutral" : "dark");
  colorScheme.set(mode === "neutral" ? "dark" : mode);
  for (const listener of listeners) listener();
}

/** Paints `mode` and keeps it for the next start. The secure store is missing on the web preview build; the mode then lasts the session. */
function applyAndRemember(mode: ThemeMode) {
  chosen = true;
  if (mode !== current) apply(mode);
  SecureStore.setItemAsync(KEY, mode).catch(() => undefined);
}

/** Applies this phone's last mode once at start. Defaults to the system setting. */
export async function restoreThemeMode() {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (chosen) return;
  apply(saved !== null && isThemeMode(saved) ? saved : "system");
}

/** The current mode, "system" included (NativeWind only reports the resolved scheme). */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/**
 * Takes the account's mode when it loads or changes (a pick on the web, too).
 * `null` means never saved: the phone's mode stays. Mount once, signed in.
 */
export function AccountThemeSync() {
  const saved = useQuery(api.auth.getTheme, {});
  // Effect: NativeWind and the kit palette are outside React.
  useEffect(() => {
    if (saved) applyAndRemember(saved);
  }, [saved]);
  return null;
}

/**
 * Picks a mode: this phone paints it at once and keeps it, and the account
 * saves it for the web and other phones (System too, as the web does).
 */
export function useSetThemeMode(): (mode: ThemeMode) => void {
  const save = useMutation(api.auth.setTheme).withOptimisticUpdate((store, args) => {
    store.setQuery(api.auth.getTheme, {}, args.theme);
  });
  return (mode) => {
    applyAndRemember(mode);
    save({ theme: mode }).catch(() => toast.error("Couldn't save theme"));
  };
}
