/**
 * Global routes that render the home sidebar (Codebases / Teams / Artifacts /
 * What's New / Feedback). `/changelog` is the old What's New path, kept so its redirect
 * keeps the same chrome instead of flashing the bare layout.
 *
 * Read through `routeHasSidePanel`, which both `Sidebar` (the panel) and
 * `useSidebarContentOffset` (the matching left padding) use.
 */
const HOME_ROOTS = [
  "/home",
  "/teams",
  "/artifacts",
  "/whats-new",
  "/feedback",
  "/changelog",
] as const;

/** Whether `pathname` is one of the home routes or a child of one. */
export function isHomePath(pathname: string): boolean {
  return HOME_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/** Root `/settings/*` only — not repo `/$owner/$repo/settings/*`. */
export function isGlobalSettingsPath(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}
