/**
 * One-time sweep moving persisted sandbox UI state from the legacy `conductor:`
 * key prefix to `eva:`, so the workspace rename does not reset everyone's pane
 * layout, terminal scrollback, editor/computer tab, PR diff-viewed ticks, or
 * per-session settings.
 *
 * Runs at module scope in `main.tsx` before React mounts, so the hooks that read
 * these keys (`useLocalStorage`, terminal history) see the
 * migrated values on their very first render rather than falling back to
 * defaults and then overwriting the migrated state.
 *
 * Delete this once no active browser plausibly still holds `conductor:*` keys —
 * a few months after the rename ships. Nothing else imports it.
 */

import {
  LEGACY_SIDEBAR_TOTAL_WIDTH_KEY,
  SIDEBAR_PANEL_WIDTH_KEY,
  SIDEBAR_RAIL_WIDTH_PX,
} from "@/lib/components/sidebar/shellLayout";

const LEGACY_PREFIX = "conductor:";
const CURRENT_PREFIX = "eva:";

/**
 * Moves every `conductor:*` entry in one store to its `eva:*` equivalent.
 * Returns the number of entries moved.
 *
 * Keys are collected before any mutation: removing entries mid-iteration shifts
 * the remaining indices and would silently skip half of them.
 */
function migrateStore(store: Storage): number {
  const legacyKeys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key !== null && key.startsWith(LEGACY_PREFIX)) {
      legacyKeys.push(key);
    }
  }

  let moved = 0;
  for (const legacyKey of legacyKeys) {
    const value = store.getItem(legacyKey);
    store.removeItem(legacyKey);
    if (value === null) continue;

    const currentKey = `${CURRENT_PREFIX}${legacyKey.slice(LEGACY_PREFIX.length)}`;
    // Never clobber state already written under the new key — a user who has
    // loaded the renamed build once has fresher state than the legacy entry.
    if (store.getItem(currentKey) === null) {
      store.setItem(currentKey, value);
      moved += 1;
    }
  }
  return moved;
}

/**
 * Moves the stored sidebar width to the package `AppShell` format: the old key
 * held the rail plus the panel (px), the new key holds the panel only.
 */
function migrateSidebarWidth(store: Storage): void {
  const legacy = store.getItem(LEGACY_SIDEBAR_TOTAL_WIDTH_KEY);
  if (legacy === null) return;
  store.removeItem(LEGACY_SIDEBAR_TOTAL_WIDTH_KEY);
  if (store.getItem(SIDEBAR_PANEL_WIDTH_KEY) !== null) return;
  const total = Number(legacy);
  if (!Number.isFinite(total)) return;
  store.setItem(
    SIDEBAR_PANEL_WIDTH_KEY,
    JSON.stringify(total - SIDEBAR_RAIL_WIDTH_PX),
  );
}

/** Migrates the legacy keys in localStorage and sessionStorage. Never throws. */
export function migrateLegacyStorageKeys(): void {
  // Storage access throws outright in some privacy modes, and setItem can throw
  // on quota. A failed migration must not stop the app from booting — the worst
  // case is that the user's pane layout falls back to defaults.
  try {
    migrateStore(window.localStorage);
  } catch {
    // Ignore: localStorage unavailable or full.
  }
  try {
    migrateSidebarWidth(window.localStorage);
  } catch {
    // Ignore: the shell uses the default width.
  }
  try {
    migrateStore(window.sessionStorage);
  } catch {
    // Ignore: sessionStorage unavailable or full.
  }
}
