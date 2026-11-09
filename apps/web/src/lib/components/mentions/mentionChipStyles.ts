/**
 * Pill styling for @ doc/PRD mentions and / skill chips.
 * Uses theme accent tokens so chips follow the user's accent color (Settings → Theme).
 *
 * `max-w-full` keeps a long label from pushing the message bubble (and the
 * page) wider than a phone viewport.
 */
export const MENTION_CHIP_CLASS =
  "inline-flex max-sm:max-w-full items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground";

export const SKILL_CHIP_CLASS = MENTION_CHIP_CLASS;

/** Applied in the editor when doc/skill chips navigate on click. */
export const EDITOR_CHIP_CLICKABLE_CLASS =
  "cursor-pointer transition-[background-color] hover:bg-primary/20";
