import type { SidebarResizeOptions } from "@vvedantb/ui";

/** Before the package shell, eva stored the rail plus the panel under this key. */
const LEGACY_TOTAL_WIDTH_KEY = "eva-sidebar-width";
const PANEL_WIDTH_KEY = "eva-sidebar-panel-width";
/** `--app-shell-rail-width` default (3.5rem) in px. */
const RAIL_WIDTH_PX = 56;

/**
 * Panel widths for the package `AppShell` (px, rail excluded). With the rail
 * they give the same total widths as before: 240 / 320 / 480.
 */
export const SIDEBAR_RESIZE: SidebarResizeOptions = {
  storageKey: PANEL_WIDTH_KEY,
  defaultWidth: 264,
  minWidth: 184,
  maxWidth: 424,
};

/**
 * One-time move of the stored width to the package format (panel px). Runs at
 * module load, so the value is there before the shell reads it.
 */
function migrateLegacySidebarWidth() {
  if (typeof window === "undefined") return;
  try {
    const legacy = window.localStorage.getItem(LEGACY_TOTAL_WIDTH_KEY);
    if (legacy === null) return;
    window.localStorage.removeItem(LEGACY_TOTAL_WIDTH_KEY);
    if (window.localStorage.getItem(PANEL_WIDTH_KEY) !== null) return;
    const total = Number(legacy);
    if (!Number.isFinite(total)) return;
    window.localStorage.setItem(
      PANEL_WIDTH_KEY,
      JSON.stringify(total - RAIL_WIDTH_PX),
    );
  } catch {
    // Storage is blocked: the shell uses the default width.
  }
}

migrateLegacySidebarWidth();

/**
 * Route height classes. `AppShell.Content` pads for the mobile header below
 * `md`, so a route fills the space under it. The `0px` fallback is for embedded
 * documents, which render with no shell. The bottom inset keeps the composer
 * and last rows above the home indicator; it is `0` on desktop.
 */
const SHELL_ROUTE_BOTTOM_INSET = "pb-[env(safe-area-inset-bottom)]";

/** Viewport-bound route (repo, inbox, Ave): the route scrolls inside itself. */
export const SHELL_VIEWPORT_ROUTE_CLASS = `h-[calc(100dvh-var(--app-shell-mobile-header-height,0px))] overflow-hidden md:h-dvh ${SHELL_ROUTE_BOTTOM_INSET}`;

/** Document route: the page scrolls. */
export const SHELL_DOCUMENT_ROUTE_CLASS = `min-h-[calc(100dvh-var(--app-shell-mobile-header-height,0px))] md:min-h-dvh ${SHELL_ROUTE_BOTTOM_INSET}`;
