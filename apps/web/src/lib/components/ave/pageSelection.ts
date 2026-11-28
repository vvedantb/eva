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
