/**
 * Monorepo apps use one `$repo` path segment internally (`repo--app`). The
 * router rewrite in `main.tsx` maps that to slash URLs in the address bar
 * (`repo/app`) and back again on input.
 */

/** Path segments that are repo sections, not monorepo app names. */
export const KNOWN_REPO_SUB_PAGES = new Set([
  "projects",
  "docs",
  "reviews",
  "sessions",
  "quick-tasks",
  "settings",
  "testing-arena",
  "stats",
  "today",
  "automations",
  "inbox",
  "drafts",
]);

/** Global first segments that are never `/$owner/$repo/...`. */
const NON_REPO_PATH_PREFIXES = new Set([
  "home",
  "sign-in",
  "sign-up",
  "setup",
  "teams",
  "inbox",
  "artifacts",
  "sessions",
  "automations",
  "api",
  "settings",
  "testing",
  "agent-callback",
  "mcp",
]);

/**
 * Public href for a repo. Monorepo apps use `name/app` so the address bar and
 * raw `<a href>` never show `repo--app`. Router matching still uses the
 * encoded form via {@link toInternalRepoHref} / the rewrite in `main.tsx`.
 */
export function repoHref(
  owner: string,
  name: string,
  rootDirectory?: string,
): string {
  if (!rootDirectory) return `/${owner}/${name}`;
  const appName = rootDirectory.split("/").pop();
  if (!appName) return `/${owner}/${name}`;
  return `/${owner}/${name}/${appName}`;
}

/** @deprecated Alias of {@link repoHref} — both are slash form now. */
export function repoPublicHref(
  owner: string,
  name: string,
  rootDirectory?: string,
): string {
  return repoHref(owner, name, rootDirectory);
}

/**
 * Build the router's internal `$repo` param (`name` or `name--app`) for a repo
 * that is not in the URL — e.g. mounting a repo-scoped tree from a global route.
 */
export function encodeRepoParam(name: string, rootDirectory?: string): string {
  const appName = rootDirectory?.split("/").pop();
  return appName ? `${name}--${appName}` : name;
}

/** Parse the router's internal `$repo` param (`name` or `name--app`). */
export function decodeRepoParam(repoParam: string): {
  name: string;
  appName: string | undefined;
} {
  const parts = repoParam.split("--");
  return {
    name: parts[0],
    appName: parts.length > 1 ? parts[1] : undefined,
  };
}

/**
 * Browser slash URL → router internal `--` URL.
 * `/owner/repo/app/…` → `/owner/repo--app/…`
 */
export function toInternalRepoHref(href: string): string {
  const { pathname, suffix } = splitHref(href);
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length >= 3 &&
    !NON_REPO_PATH_PREFIXES.has(segments[0]) &&
    !KNOWN_REPO_SUB_PAGES.has(segments[2]) &&
    !segments[1].includes("--")
  ) {
    const [owner, repo, app, ...rest] = segments;
    const restPath = rest.length > 0 ? `/${rest.join("/")}` : "";
    return `/${owner}/${repo}--${app}${restPath}${suffix}`;
  }
  return href;
}

/**
 * Router internal `--` URL → browser slash URL.
 * `/owner/repo--app/…` → `/owner/repo/app/…`
 */
export function toDisplayRepoHref(href: string): string {
  const { pathname, suffix } = splitHref(href);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[1].includes("--")) {
    const [name, appName] = segments[1].split("--", 2);
    if (appName) {
      const rest = segments.length > 2 ? `/${segments.slice(2).join("/")}` : "";
      return `/${segments[0]}/${name}/${appName}${rest}${suffix}`;
    }
  }
  return href;
}

/**
 * Repo sections whose sidebar belongs to a global rail entry (one cross-repo
 * panel) rather than to the app. Clicking an app tile means "show me this app",
 * so these are never carried across — landing on them would leave the same
 * global panel open and never reveal the app sidebar.
 */
const RAIL_GLOBAL_SECTIONS = new Set(["sessions", "automations"]);

/**
 * The repo section a path sits in (`quick-tasks`, `projects`, …), or null for a
 * repo root, a non-repo path, or a section owned by a global rail entry.
 * Anything below the section — entity ids, tabs, query, hash — is dropped, so
 * switching apps keeps the view without carrying a task or session that belongs
 * to the app you left. Accepts either URL form.
 */
export function repoSectionFromPath(pathname: string): string | null {
  const { pathname: internal } = splitHref(toInternalRepoHref(pathname));
  const segments = internal.split("/").filter(Boolean);
  if (segments.length < 3) return null;
  if (NON_REPO_PATH_PREFIXES.has(segments[0])) return null;
  const section = segments[2];
  if (RAIL_GLOBAL_SECTIONS.has(section)) return null;
  return KNOWN_REPO_SUB_PAGES.has(section) ? section : null;
}

/**
 * Public href for a repo, landing on `section` when one is given. Used by the
 * rail so an app tile keeps the section you are already looking at.
 */
export function repoSectionHref(
  owner: string,
  name: string,
  rootDirectory: string | undefined,
  section: string | null,
): string {
  const base = repoHref(owner, name, rootDirectory);
  return section === null ? base : `${base}/${section}`;
}

/**
 * Turn a stored href into the arguments TanStack `navigate` actually reads.
 *
 * The router never splits a query string out of `to` — it resolves the whole
 * string as a pathname, so `/o/r/quick-tasks/3?comment=abc` matches nothing.
 * Search has to be handed over separately, which is what this does, on top of
 * the `repo--app` rewrite every stored href needs anyway.
 */
export function hrefToNavigateOptions(href: string): {
  to: string;
  search: Record<string, string>;
} {
  const internal = toInternalRepoHref(href);
  const { pathname, suffix } = splitHref(internal);
  if (!suffix.startsWith("?")) return { to: internal, search: {} };
  const [query] = suffix.slice(1).split("#");
  const search: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    search[key] = value;
  }
  return { to: pathname, search };
}

function splitHref(href: string): { pathname: string; suffix: string } {
  const qIdx = href.indexOf("?");
  const hIdx = href.indexOf("#");
  const end =
    qIdx >= 0 && hIdx >= 0
      ? Math.min(qIdx, hIdx)
      : qIdx >= 0
        ? qIdx
        : hIdx >= 0
          ? hIdx
          : href.length;
  return {
    pathname: href.substring(0, end),
    suffix: href.substring(end),
  };
}
