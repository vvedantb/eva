/**
 * Which way a vertical nav click moves: to an item below the current one
 * ("down") or above it ("up"). The router reads it when it starts the page
 * view transition (`main.tsx`), so content slides in that direction
 * (globals.css):
 * - `rail`: a rail tile (`[data-rail-tile]`, current `[data-active]`). The
 *   side panel and the page both slide.
 * - `nav`: a side-panel link (`.vt-panel a`, current `[aria-current=page]`).
 *   Only the page slides; the panel is the list that was clicked.
 * Other page swaps keep the plain page transition.
 */
export type NavDirection = "down" | "up";
export type NavSource = "rail" | "nav";

/** A click older than this did not start the navigation being transitioned. */
const CLICK_WINDOW_MS = 1000;

let pending: { source: NavSource; direction: NavDirection; at: number } | null =
  null;

function directionBetween(from: Element, to: Element): NavDirection | null {
  const a = from.getBoundingClientRect().top;
  const b = to.getBoundingClientRect().top;
  if (a === b) return null;
  return b > a ? "down" : "up";
}

function onNavClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const tile = event.target.closest("[data-rail-tile]");
  if (tile !== null) {
    if (tile.hasAttribute("data-active")) return;
    const active = document.querySelector("[data-rail-tile][data-active]");
    const direction = active && directionBetween(active, tile);
    if (direction) pending = { source: "rail", direction, at: performance.now() };
    return;
  }
  const link = event.target.closest(".vt-panel a[href]");
  if (link === null || link.getAttribute("aria-current") === "page") return;
  const current = link
    .closest(".vt-panel")
    ?.querySelector('a[aria-current="page"]');
  const direction = current && directionBetween(current, link);
  if (direction) pending = { source: "nav", direction, at: performance.now() };
}

if (typeof document !== "undefined") {
  document.addEventListener("click", onNavClick, true);
}

/** The source and direction of the click that started this navigation, once. */
export function takeNavDirection(): {
  source: NavSource;
  direction: NavDirection;
} | null {
  const click = pending;
  pending = null;
  if (click === null || performance.now() - click.at > CLICK_WINDOW_MS) {
    return null;
  }
  return { source: click.source, direction: click.direction };
}
