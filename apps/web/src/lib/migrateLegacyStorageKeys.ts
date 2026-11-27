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
    if (store.getItem(currentKey) === null) {
      store.setItem(currentKey, value);
      moved += 1;
    }
  }
  return moved;
}

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
  try {
    migrateStore(window.localStorage);
  } catch {
  }
  try {
    migrateSidebarWidth(window.localStorage);
  } catch {
  }
  try {
    migrateStore(window.sessionStorage);
  } catch {
  }
}
