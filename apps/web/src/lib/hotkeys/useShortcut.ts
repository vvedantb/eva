import { createContext, useContext } from "react";
import {
  useHotkey,
  type Hotkey,
  type HotkeyCallback,
  type UseHotkeyOptions,
} from "@tanstack/react-hotkeys";
import { resolveBinding, type ShortcutId } from "@/lib/hotkeys/registry";

interface ShortcutsContextValue {
  /** Sparse map of shortcut id to hotkey. Empty until the query resolves. */
  overrides: Record<string, string>;
}

export const ShortcutsStateContext =
  createContext<ShortcutsContextValue | null>(null);

export const EMPTY_SHORTCUT_OVERRIDES: Record<string, string> = {};

function useOverrides(): Record<string, string> {
  const ctx = useContext(ShortcutsStateContext);
  return ctx?.overrides ?? EMPTY_SHORTCUT_OVERRIDES;
}

/** The combo currently bound to a shortcut, for display in a `Kbd`. */
export function useShortcutBinding(id: ShortcutId): Hotkey {
  return resolveBinding(id, useOverrides());
}

/**
 * Registers a shortcut by id rather than by literal combo, so the user's
 * binding from settings → Shortcuts takes effect. Drop-in replacement for
 * `useHotkey`; `options.enabled` and `options.target` behave the same.
 */
export function useShortcut(
  id: ShortcutId,
  callback: HotkeyCallback,
  options?: UseHotkeyOptions,
) {
  useHotkey(useShortcutBinding(id), callback, options);
}
