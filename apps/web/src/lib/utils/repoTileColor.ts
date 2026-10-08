import { catColorForSlot, type CatSlot } from "@eva/ui";

export interface RepoTileColor {
  /** Tinted fill behind the fallback initial. */
  bg: string;
  /** Initial's colour — paired with `bg` so it reads in both themes. */
  text: string;
}

// This module's original 8-colour palette, in its original hash-bucket order:
// blue, emerald, amber, rose, purple, lime, indigo, orange. Each bucket maps
// onto the nearest `cat-*` slot so every repo keeps the colour family it
// already had — `catColorForId` would have re-hashed and reshuffled them.
// The mapping is injective, so tiles stay as distinguishable as before.
const LEGACY_SLOT_BY_BUCKET: Record<number, CatSlot> = {
  0: 1, // blue -> blue
  1: 6, // emerald -> emerald
  2: 4, // amber -> amber
  3: 5, // rose -> rose
  4: 2, // purple -> violet
  5: 3, // lime -> teal (nearest remaining hue)
  6: 7, // indigo -> sky
  7: 8, // orange -> orange
};

/**
 * Deterministic tile colour so logo-less repos stay visually distinguishable.
 * Seed with `${owner}/${name}/${repoDisplayLabel(row)}` so every surface that
 * renders a repo's initial tile (rail, composer switcher) picks the same colour.
 *
 * Keeps this module's original additive hash rather than the shared
 * `catSlotForId` rolling hash, so existing repos do not change colour.
 *
 * `cat-*`'s dark-mode values are lightened for text contrast, not for a solid
 * fill behind a fixed white letter, so this returns a tint + matching text
 * colour pair (Linear-style initial chip) instead of one solid background
 * class — a solid fill would fail contrast in dark mode for the lighter slots.
 */
export function repoTileColor(seed: string): RepoTileColor {
  let bucket = 0;
  for (let i = 0; i < seed.length; i++) {
    bucket = (bucket + seed.charCodeAt(i)) % 8;
  }
  const { bgTint, text } = catColorForSlot(LEGACY_SLOT_BY_BUCKET[bucket] ?? 1);
  return { bg: bgTint, text };
}
