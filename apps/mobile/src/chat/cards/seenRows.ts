import { createContext, useContext, useSyncExternalStore } from "react";
import type { ViewToken } from "react-native";

/**
 * The transcript rows that have been on screen, so a row's heavy part (a
 * WebView) mounts only once its row is first seen, as the web's
 * `loading="lazy"` frame. Rows are never unseen: a page scrolled past keeps
 * its state, until the list itself recycles the row.
 */
export type SeenRows = {
  /** For the list's `onViewableItemsChanged`. Stable: the list rejects a new one. */
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  subscribe: (listener: () => void) => () => void;
  has: (key: string) => boolean;
};

export function createSeenRows(): SeenRows {
  const seen = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    onViewableItemsChanged: ({ viewableItems }) => {
      let added = false;
      for (const token of viewableItems) {
        if (token.key && !seen.has(token.key)) {
          seen.add(token.key);
          added = true;
        }
      }
      if (added) for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    has: (key) => seen.has(key),
  };
}

/** Null outside a transcript: everything counts as seen. */
export const SeenRowsContext = createContext<SeenRows | null>(null);

/** True once the row keyed `key` has been on screen. */
export function useRowSeen(key: string): boolean {
  const rows = useContext(SeenRowsContext);
  return useSyncExternalStore(
    (listener) => rows?.subscribe(listener) ?? (() => {}),
    () => rows?.has(key) ?? true,
  );
}
