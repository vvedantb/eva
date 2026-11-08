import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import { useSyncExternalStore } from "react";

export type ColorSchemeChoice = "light" | "dark" | "system";

const KEY = "eva.colorScheme";
let current: ColorSchemeChoice = "system";
const listeners = new Set<() => void>();

function isChoice(value: string | null): value is ColorSchemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function apply(choice: ColorSchemeChoice) {
  current = choice;
  colorScheme.set(choice);
  for (const listener of listeners) listener();
}

/** Applies a light / dark / system choice now and remembers it for the next launch. */
export function setColorSchemeChoice(choice: ColorSchemeChoice) {
  apply(choice);
  // Secure store is unavailable on the web preview build; the choice then lasts the session.
  SecureStore.setItemAsync(KEY, choice).catch(() => undefined);
}

/** Applies the saved choice once at start. Defaults to the system setting. */
export async function restoreColorSchemeChoice() {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null);
  apply(isChoice(saved) ? saved : "system");
}

/** The current choice, "system" included (NativeWind only reports the resolved scheme). */
export function useColorSchemeChoice(): ColorSchemeChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
