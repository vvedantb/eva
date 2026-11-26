/**
 * The text the user last selected on the page, for Manager Ave.
 *
 * It cannot be read at send time: clicking into Ave's composer moves the
 * selection into the composer and the page selection is gone. So a
 * `selectionchange` listener keeps the last selection made outside Ave, and
 * drops it when the user clicks elsewhere on the page (a collapsed selection).
 * Selections inside Ave (marked with `AVE_SURFACE_ATTR`) are ignored, so
 * opening the panel and typing keep it.
 *
 * A module listener, not a hook: it must run from app start, before the panel
 * first opens, and nothing renders from it.
 */

const AVE_SURFACE_KEY = "data-ave-surface";

/** Spread on the root of every Ave surface (panel, launcher, `/ave` page). */
export const AVE_SURFACE_ATTR = { [AVE_SURFACE_KEY]: "" };

type PageSelection = { text: string; path: string };

let last: PageSelection | null = null;

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function onSelectionChange() {
  const selection = document.getSelection();
  const node = selection?.anchorNode ?? null;
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  if (element?.closest(`[${AVE_SURFACE_KEY}]`)) return;
  const text = selection?.toString().trim() ?? "";
  last = text === "" ? null : { text, path: currentPath() };
}

if (typeof document !== "undefined") {
  document.addEventListener("selectionchange", onSelectionChange);
}

/**
 * The selection made on the page the user is on now, then forgotten: one
 * message quotes it once. A selection from another page is not this page's.
 */
export function takePageSelection(): string | undefined {
  const taken = last;
  last = null;
  return taken !== null && taken.path === currentPath() ? taken.text : undefined;
}
