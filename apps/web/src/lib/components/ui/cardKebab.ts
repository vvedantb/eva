/**
 * The below-`sm` kebab that re-hosts a card's `ContextMenu` actions.
 *
 * Right-click is all a pointer device needs, but touch has nothing to
 * right-click: Radix's `ContextMenu` does implement long-press, so the actions
 * are reachable, yet with no visual affordance they are undiscoverable — "Hide
 * repo", "Delete draft" and "Set logo" were effectively absent on a phone. Seven
 * card surfaces now pair their context menu with this trigger, so the styling
 * lives once instead of being copied per card.
 *
 * Positioning is deliberately **not** included, because it differs by card: some
 * park it absolutely over a wrapping `<Link>` (a button cannot be a descendant of
 * an anchor), others are a plain flex child. Compose it:
 *
 * - over a stretched-overlay row (`ListRow`, or any `absolute inset-0` link):
 *   add `LIST_ROW_CONTROL_CLASS` from `@vvedantb/ui`, or the kebab sits *under* the
 *   overlay and cannot be tapped;
 * - as an absolutely-positioned sibling of a wrapping `<Link>`: add
 *   `absolute … z-2`, and give the card `max-sm:pr-*` so its content does not run
 *   underneath. Do not also add `LIST_ROW_CONTROL_CLASS` — its `relative` and
 *   Tailwind's `absolute` are both one class, so source order decides and the
 *   kebab drops back into flow.
 *
 * `hit-target` is included: the button is 24px, and the utility grows the
 * pressable area to 40px without changing layout.
 *
 * Motion comes from `motion-press`, not a hand-listed
 * `transition-[background-color,color,transform]`. An arbitrary list emits
 * exactly the properties it names, and Tailwind compiles `scale-[0.96]` to
 * `scale: 0.96` — an individual transform property that `transform` does not
 * match — so the press here never animated. The utility owns the correct
 * property set and the house rule that colour trails the press.
 */
export const CARD_KEBAB_CLASS =
  "motion-press flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hit-target hover:bg-muted/80 hover:text-foreground active:scale-[0.96] sm:hidden";
