/**
 * Ref callback for the landing page root. Flags `<html data-landing>` while the
 * marketing page is mounted, so `globals.css` can scope root-level rules
 * (smooth anchor scroll, overscroll) to it.
 *
 * Not `html:has(#top)`: a `:has()` on the root makes Chrome re-check the whole
 * document whenever nodes are removed, which made every React commit in a long
 * session cost O(DOM size). An attribute selector is only re-checked when the
 * attribute itself changes.
 */
export function markLandingRoot(element: HTMLElement | null) {
  if (!element) return;
  const root = element.ownerDocument.documentElement;
  root.setAttribute("data-landing", "");
  return () => root.removeAttribute("data-landing");
}
