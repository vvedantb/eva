/**
 * Pill styling for @ people/doc mentions and / skill chips: a fixed blue
 * (`--mention*` in globals.css), so a chip reads on any bubble whatever the
 * theme accent. A neutral accent-soft was the same grey as a teammate bubble.
 *
 * `max-w-full` keeps a long label from pushing the message bubble (and the
 * page) wider than a phone viewport.
 */
export const MENTION_CHIP_CLASS =
  "inline-flex max-sm:max-w-full items-center rounded-full bg-mention px-2 py-0.5 text-xs font-medium text-mention-foreground";

export const SKILL_CHIP_CLASS = MENTION_CHIP_CLASS;

/** A mention of the person reading: the same chip, a stronger fill. */
export const MENTION_CHIP_SELF_CLASS = MENTION_CHIP_CLASS.replace(
  "bg-mention ",
  "bg-mention-self ",
);

/** Applied in the editor when doc/skill chips navigate on click. */
export const EDITOR_CHIP_CLICKABLE_CLASS =
  "cursor-pointer transition-[background-color] hover:bg-primary/20";
