/**
 * Global routes that render the home sidebar (Codebases / Teams / Artifacts /
 * What's New / Feedback). `/changelog` is the old What's New path, kept so its redirect
 * keeps the same chrome instead of flashing the bare layout.
 *
 * Read through `routeHasSidePanel`, which both `Sidebar` (the panel) and
 * the package `AppShell` (the matching content offset) use.
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

/** The root Projects pages: the overview and every project below it. */
export function isProjectsPath(pathname: string): boolean {
  return pathname === "/projects" || pathname.startsWith("/projects/");
}

/** One project's page (`/projects/owner/name[/app]/<numId>/…`), not the overview. */
export function isProjectPagePath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] === "projects" && segments.length >= 4;
}
