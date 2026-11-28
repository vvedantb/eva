import { catColorForSlot, catSlotForId } from "@vvedantb/ui";
import type { CatSlot } from "@vvedantb/ui";

/** Stable Chrome-like tab-group accent for a repo id. */
export interface TabGroupColor {
  underline: string;
  pill: string;
  border: string;
  accent: string;
}

const LEGACY_SLOT_BY_BUCKET: Record<number, CatSlot> = {
  0: 7,
  1: 5,
  2: 4,
  3: 6,
  4: 2,
  5: 2,
  6: 7,
  7: 8,
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
