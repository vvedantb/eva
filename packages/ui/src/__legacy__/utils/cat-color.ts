/**
 * Muted categorical ramp for hash-assigned identity colour — session tab
 * groups, repo tiles, avatars. Not for status; status uses `status-*`.
 *
 * The ramp is eight CSS vars (`--cat-1` … `--cat-8`, see globals.css),
 * exposed as the Tailwind `cat` colour family. This module owns the
 * id → slot hashing once, so every consumer picks the same slot for the
 * same id and the class names stay literal (Tailwind's extractor cannot
 * see `` `bg-cat-${n}` ``, only the strings written out below).
 */

/** Number of slots in the muted categorical ramp (--cat-1 … --cat-8). */
export const CAT_SLOT_COUNT = 8;

export type CatSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface CatColorClasses {
  /** Solid foreground colour — text, icons, and `currentColor` accents. */
  text: string;
  /** Solid fill — underline strips, dots, anything with no text on top. */
  bg: string;
  /** Tinted fill, sized to sit behind `text` at readable contrast in both themes. */
  bgTint: string;
  /** Solid border stroke. */
  border: string;
}

// One literal record per slot so Tailwind's class extractor sees every
// `cat-N` utility it needs to generate — a template string would hide them.
const CAT_COLOR_CLASSES: Record<CatSlot, CatColorClasses> = {
  1: {
    text: "text-cat-1",
    bg: "bg-cat-1",
    bgTint: "bg-cat-1/12",
    border: "border-cat-1",
  },
  2: {
    text: "text-cat-2",
    bg: "bg-cat-2",
    bgTint: "bg-cat-2/12",
    border: "border-cat-2",
  },
  3: {
    text: "text-cat-3",
    bg: "bg-cat-3",
    bgTint: "bg-cat-3/12",
    border: "border-cat-3",
  },
  4: {
    text: "text-cat-4",
    bg: "bg-cat-4",
    bgTint: "bg-cat-4/12",
    border: "border-cat-4",
  },
  5: {
    text: "text-cat-5",
    bg: "bg-cat-5",
    bgTint: "bg-cat-5/12",
    border: "border-cat-5",
  },
  6: {
    text: "text-cat-6",
    bg: "bg-cat-6",
    bgTint: "bg-cat-6/12",
    border: "border-cat-6",
  },
  7: {
    text: "text-cat-7",
    bg: "bg-cat-7",
    bgTint: "bg-cat-7/12",
    border: "border-cat-7",
  },
  8: {
    text: "text-cat-8",
    bg: "bg-cat-8",
    bgTint: "bg-cat-8/12",
    border: "border-cat-8",
  },
};

// Maps the hash's 0–7 bucket onto the 1–8 slot type without a cast — indexing
// a `Record<number, CatSlot>` by the modulo result stays inside the type
// system, unlike `(index + 1) as CatSlot`.
const SLOT_BY_INDEX: Record<number, CatSlot> = {
  0: 1,
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
};

function slotFromIndex(index: number): CatSlot {
  return SLOT_BY_INDEX[index] ?? 1;
}

/**
 * Stable, order-independent slot for an arbitrary id.
 *
 * Same rolling hash the old tab-group palette used (`hash * 31 + charCode`),
 * reused here rather than invented fresh so ids that landed in the same
 * bucket before still land in the same bucket now.
 */
export function catSlotForId(id: string): CatSlot {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CAT_SLOT_COUNT;
  return slotFromIndex(index);
}

/** Class set for a known slot — for consumers that need to remap a legacy bucket onto a slot. */
export function catColorForSlot(slot: CatSlot): CatColorClasses {
  return CAT_COLOR_CLASSES[slot];
}

/** Pre-composed class set for an arbitrary id. */
export function catColorForId(id: string): CatColorClasses {
  return catColorForSlot(catSlotForId(id));
}
