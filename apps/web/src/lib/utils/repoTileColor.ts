import { catColorForSlot } from "@vvedantb/ui";
import { repoTileSlot } from "@eva/shared";

export interface RepoTileColor {
  /** Tinted fill behind the fallback initial. */
  bg: string;
  /** Initial's colour — paired with `bg` so it reads in both themes. */
  text: string;
}

/**
 * Deterministic tile colour so logo-less repos stay visually distinguishable.
 * Seed with `${owner}/${name}/${repoDisplayLabel(row)}` so every surface that
 * renders a repo's initial tile (rail, composer switcher) picks the same colour;
 * the slot is `repoTileSlot` (`@eva/shared`), which the phone header shares.
 *
 * `cat-*`'s dark-mode values are lightened for text contrast, not for a solid
 * fill behind a fixed white letter, so this returns a tint + matching text
 * colour pair (Linear-style initial chip) instead of one solid background
 * class — a solid fill would fail contrast in dark mode for the lighter slots.
 */
export function repoTileColor(seed: string): RepoTileColor {
  const { bgTint, text } = catColorForSlot(repoTileSlot(seed));
  return { bg: bgTint, text };
}
