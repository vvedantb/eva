/**
 * Which way a rail click moves: to a tile below the active one ("down") or
 * above it ("up"). The router reads it when it starts the page view
 * transition (`main.tsx`), so the side panel and page slide in that direction
 * (`rail-down` / `rail-up` in globals.css). Only rail clicks carry a
 * direction; other page swaps keep the plain page transition.
 */
export type RailDirection = "down" | "up";

/** A click older than this did not start the navigation being transitioned. */
const CLICK_WINDOW_MS = 1000;

let pending: { direction: RailDirection; at: number } | null = null;

function onRailClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const tile = event.target.closest("[data-rail-tile]");
  if (tile === null || tile.hasAttribute("data-active")) return;
  const active = document.querySelector("[data-rail-tile][data-active]");
  if (active === null) return;
  const from = active.getBoundingClientRect();
  const to = tile.getBoundingClientRect();
  if (to.top === from.top) return;
  pending = {
    direction: to.top > from.top ? "down" : "up",
    at: performance.now(),
  };
}

if (typeof document !== "undefined") {
  document.addEventListener("click", onRailClick, true);
}

/** The direction of the rail click that started this navigation, once. */
export function takeRailDirection(): RailDirection | null {
  const click = pending;
  pending = null;
  if (click === null || performance.now() - click.at > CLICK_WINDOW_MS) {
    return null;
  }
  return click.direction;
}
