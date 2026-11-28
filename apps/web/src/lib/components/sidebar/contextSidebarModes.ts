export type ContextSidebarMode =
  | "main"
  | "settings"
  | "docs"
  | "reviews"
  | "testing-arena";

const CONTEXT_SIDEBAR_BY_NAV_NAME = new Map<string, ContextSidebarMode>([
  ["Settings", "settings"],
  ["Documents", "docs"],
  ["Reviews", "reviews"],
  ["Testing Arena", "testing-arena"],
]);

/** Resolves the drill-down mode for a nav item name, or undefined for plain links. */
export function contextSidebarModeForNav(
  navName: string,
): ContextSidebarMode | undefined {
  return CONTEXT_SIDEBAR_BY_NAV_NAME.get(navName);
}
