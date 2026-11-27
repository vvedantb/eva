/**
 * The parts of a DOM element this check reads. `HTMLElement` satisfies it, and
 * naming them keeps the rule testable without a DOM.
 */
export interface ComposerElement {
  isConnected: boolean;
  getClientRects: () => { length: number };
  closest: (selectors: string) => ComposerElement | null;
}

/**
 * Whether a composer is the one the user is actually looking at.
 *
 * Several composers stay mounted at once: the sessions layout keeps up to three
 * session shells alive under `display: none` / `aria-hidden`, and Manager Ave's
 * panel never unmounts. Anything listening on `document` (type-to-focus, the
 * chat shortcuts) therefore fires once per mounted composer unless it asks
 * whether its own editor is on screen first — which is how one keystroke ended
 * up appended to every mounted draft, and persisted server-side by ChatDraftSync.
 *
 * `getClientRects()` is the display check (a `display: none` ancestor yields
 * none), `isConnected` rules out an editor already detached, and the
 * `aria-hidden` ancestor covers a shell that is hidden from the user but still
 * laid out.
 */
export function isComposerVisible(
  element: ComposerElement | null | undefined,
): boolean {
  if (!element) return false;
  // A backgrounded tab has no visible composer at all, so no mounted one may
  // claim a keystroke the user aimed at another window.
  if (typeof document !== "undefined" && document.visibilityState !== "visible")
    return false;
  if (!element.isConnected) return false;
  if (element.getClientRects().length === 0) return false;
  return element.closest('[aria-hidden="true"]') === null;
}
