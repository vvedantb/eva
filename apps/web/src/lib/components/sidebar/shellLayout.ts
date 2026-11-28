import type { SidebarResizeOptions } from "@vvedantb/ui";

/** Before the package shell, eva stored the rail plus the panel under this key. */
export const LEGACY_SIDEBAR_TOTAL_WIDTH_KEY = "eva-sidebar-width";
export const SIDEBAR_PANEL_WIDTH_KEY = "eva-sidebar-panel-width";
/** `--app-shell-rail-width` default (3.5rem) in px. */
export const SIDEBAR_RAIL_WIDTH_PX = 56;

/**
 * Panel widths for the package `AppShell` (px, rail excluded). With the rail
 * they give the same total widths as before: 240 / 320 / 480.
 */
export const SIDEBAR_RESIZE: SidebarResizeOptions = {
  storageKey: SIDEBAR_PANEL_WIDTH_KEY,
  defaultWidth: 264,
  minWidth: 184,
  maxWidth: 424,
};

const SHELL_ROUTE_BOTTOM_INSET = "pb-[env(safe-area-inset-bottom)]";

/** Viewport-bound route (repo, inbox, Ave): the route scrolls inside itself. */
export const SHELL_VIEWPORT_ROUTE_CLASS = `h-[calc(100dvh-var(--app-shell-mobile-header-height,0px))] overflow-hidden md:h-dvh ${SHELL_ROUTE_BOTTOM_INSET}`;

/** Document route: the page scrolls. */
export const SHELL_DOCUMENT_ROUTE_CLASS = `min-h-[calc(100dvh-var(--app-shell-mobile-header-height,0px))] md:min-h-dvh ${SHELL_ROUTE_BOTTOM_INSET}`;
