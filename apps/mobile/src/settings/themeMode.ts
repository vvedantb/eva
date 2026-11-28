import { api } from "@eva/backend";
import { isThemeMode, type ThemeMode } from "@eva/shared";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import { useEffect, useSyncExternalStore } from "react";
import { applyEvaTheme } from "@/ui/evaTheme";

const KEY = "eva.colorScheme";
let current: ThemeMode = "system";
let chosen = false;
const listeners = new Set<() => void>();

function apply(mode: ThemeMode) {
  current = mode;
  applyEvaTheme(mode === "neutral" ? "neutral" : "dark");
  colorScheme.set(mode === "neutral" ? "dark" : mode);
  for (const listener of listeners) listener();
}

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
