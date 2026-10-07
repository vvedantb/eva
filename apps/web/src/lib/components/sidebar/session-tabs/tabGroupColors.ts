import { catColorForSlot, catSlotForId, type CatSlot } from "@eva/ui";

/** Stable Chrome-like tab-group accent for a repo id. */
export interface TabGroupColor {
  /** Line under the group — Chrome's only group fill besides the pill. */
  underline: string;
  /** Group name pill. */
  pill: string;
  /** Selected-tab stroke (left/top/right) — matches the group accent. */
  border: string;
  /**
   * Same accent as a text colour. The selected tab's flared shoulders paint
   * their stroke with a gradient, which needs the accent as `currentColor`
   * rather than as a border.
   */
  accent: string;
}

// This module's original 8-colour palette, in its original hash-bucket
// order: sky, rose, amber, emerald, violet, fuchsia, cyan, orange. `cat-*`
// only has 8 hues total and some of those names share one (violet/fuchsia
// both read as violet, sky/cyan both read as sky), so this table maps each
// legacy bucket onto the closest `cat-*` slot rather than the ramp's own
// 1:1 numbering — that keeps existing groups' colours recognisable instead
// of shuffling them onto an arbitrary new hue.
//
// `catSlotForId` reuses this file's original hash formula, so
// `catSlotForId(id) - 1` is exactly the old raw bucket index — this table
// only relabels which `cat-*` slot that bucket now renders as.
const LEGACY_SLOT_BY_BUCKET: Record<number, CatSlot> = {
  0: 7, // sky -> sky
  1: 5, // rose -> rose
  2: 4, // amber -> amber
  3: 6, // emerald -> emerald
  4: 2, // violet -> violet
  5: 2, // fuchsia -> violet (closest remaining hue)
  6: 7, // cyan -> sky
  7: 8, // orange -> orange
};

export function tabGroupColorForId(id: string): TabGroupColor {
  const bucket = catSlotForId(id) - 1;
  const { text, bg, bgTint, border } = catColorForSlot(
    LEGACY_SLOT_BY_BUCKET[bucket] ?? 7,
  );
  return {
    underline: bg,
    pill: `${bgTint} ${text}`,
    border,
    accent: text,
  };
}
