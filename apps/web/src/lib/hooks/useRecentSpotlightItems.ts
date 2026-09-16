"use client";

import { useLocalStorage } from "usehooks-ts";

/** localStorage key for the last few things opened from spotlight. */
const SPOTLIGHT_RECENTS_KEY = "eva:spotlight:recents";

/** Kept short on purpose: this is a shortcut back, not a history page. */
const MAX_RECENTS = 8;

export interface RecentSpotlightItem {
  /** The hit's type, kept as a plain string — stored values outlive the union. */
  type: string;
  title: string;
  subtitle: string;
  href: string;
  /** When it was opened; the list is newest first. */
  at: number;
}

/** The stored value is user-writable, so half-formed entries are dropped. */
function parseRecents(value: RecentSpotlightItem[]): RecentSpotlightItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      typeof item.href === "string" &&
      typeof item.title === "string" &&
      typeof item.type === "string",
  );
}

/**
 * The last few results opened from spotlight, shown before anything has been
 * typed. Deduped by href, so opening the same session twice does not push
 * everything else out of the list.
 */
export function useRecentSpotlightItems() {
  const [stored, setStored] = useLocalStorage<RecentSpotlightItem[]>(
    SPOTLIGHT_RECENTS_KEY,
    [],
  );

  return {
    recents: parseRecents(stored),
    record: (item: Omit<RecentSpotlightItem, "at">) => {
      setStored((prev) =>
        [
          { ...item, at: Date.now() },
          ...parseRecents(prev).filter((entry) => entry.href !== item.href),
        ].slice(0, MAX_RECENTS),
      );
    },
    forget: (href: string) => {
      setStored((prev) =>
        parseRecents(prev).filter((entry) => entry.href !== href),
      );
    },
  };
}
