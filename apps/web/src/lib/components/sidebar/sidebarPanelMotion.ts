/**
 * The sidebar panel's dock motion (`dockMotion`), on hide and show only: it
 * shrinks into the rail's "Hide sidebar" tile and grows back out of it. An
 * app switch does not move it; that is navigation, and it happens often.
 * `SidebarPanel` and `RepoRail` mark the two nodes. The main content slides
 * its margin with the package aside's width, so it does not jump.
 */
import { dockPopIn, dockPopOut, slideWith } from "@/lib/dockMotion";

const panel = () =>
  document.querySelector<HTMLElement>("[data-sidebar-dock-panel]");
const toggleTile = () =>
  document.querySelector<HTMLElement>("[data-sidebar-dock-tile]");

/** The page beside the shell aside: its left margin follows the aside. */
function slideMainWithAside() {
  const aside = toggleTile()?.closest<HTMLElement>("aside") ?? null;
  slideWith(document.querySelector<HTMLElement>("main"), aside, "margin-left");
}

/** Shrink the panel into the toggle tile, then run `hide`. */
export function popOutSidebarPanel(hide: () => void) {
  dockPopOut(panel(), toggleTile(), "left", () => {
    slideMainWithAside();
    hide();
  });
}

/**
 * Call right after the state change that shows the panel. The package
 * mounts it in this event's commit; the next frame runs before it paints.
 */
export function popInSidebarPanelNextFrame() {
  slideMainWithAside();
  requestAnimationFrame(() => {
    const shown = panel();
    if (shown) dockPopIn(shown, toggleTile(), "left");
  });
}
