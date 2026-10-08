import { validateHotkey, type Hotkey } from "@tanstack/react-hotkeys";
import {
  SHORTCUT_DEFS,
  SHORTCUT_IDS,
  SHORTCUT_SECTIONS,
  shortcutDef,
  type ShortcutDef,
  type ShortcutId,
} from "@eva/backend";

/**
 * The web app's view of the shortcut registry. Every shortcut is declared once,
 * in `packages/backend/convex/_validators/shortcuts.ts`, so the server can
 * validate writes against the same list the settings page renders. This module
 * is the app's import surface for it, plus the helpers that need the hotkey
 * library at runtime.
 */
export { SHORTCUT_DEFS, SHORTCUT_IDS, SHORTCUT_SECTIONS, shortcutDef };
export type { ShortcutDef, ShortcutId };

/**
 * Parses an arbitrary string into the library's `Hotkey` union. Convex stores
 * overrides as plain strings, so this is the boundary that keeps a bad or
 * stale value from reaching `useHotkey` — and keeps the codebase free of casts.
 */
function isHotkey(value: string): value is Hotkey {
  return validateHotkey(value).valid;
}

/**
 * The combo currently in force for a shortcut: valid override, else default.
 *
 * The default is returned unguarded on purpose. `SHORTCUT_DEFS` is declared
 * `as const`, so its defaults keep their literal types and this return is what
 * proves, at compile time, that every one of them is a valid `Hotkey`.
 */
export function resolveBinding(
  id: ShortcutId,
  overrides: Record<string, string> | undefined,
): Hotkey {
  const override = overrides?.[id];
  if (override !== undefined && isHotkey(override)) return override;
  return SHORTCUT_DEFS[id].defaultHotkey;
}

/** The digit a slotted binding ends with, or null when it does not end in one. */
export function slotDigitOf(hotkey: Hotkey): number | null {
  const digit = Number(hotkey.slice(-1));
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return null;
  return digit;
}

/**
 * Rewrites a slotted binding for a different slot: `Alt+1` at slot 3 becomes
 * `Alt+3`. Returns null when the binding does not end in a digit, so callers
 * can skip registering that slot rather than register a nonsense combo.
 */
export function deriveSlotHotkey(base: Hotkey, slot: number): Hotkey | null {
  if (slotDigitOf(base) === null) return null;
  const candidate = `${base.slice(0, -1)}${slot}`;
  return isHotkey(candidate) ? candidate : null;
}
