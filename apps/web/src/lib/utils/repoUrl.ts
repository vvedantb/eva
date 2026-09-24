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
  "automations",
  "inbox",
  "drafts",
]);

/** Global first segments that are never `/$owner/$repo/...`. */
export const NON_REPO_PATH_PREFIXES = new Set([
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
 *
 * When you need it, and when you do not — `repoUrlRouterContract.test.ts` pins
 * both, because the answer differs by call site and guessing has cost two bugs:
 *
 * - `<Link to>` / `router.buildLocation`: **required**. These never cross the
 *   history boundary where `main.tsx`'s `rewrite.input` runs, so a display-form
 *   target matches no route. The href still renders correctly and a click still
 *   works, but active styling and `defaultPreload: "intent"` silently stop.
 * - `navigate({ to })`: **redundant**. A real navigation commits through
 *   history, so the rewrite already converts it. Harmless (the function is
 *   idempotent) and kept for uniformity — but a missing one here is not a bug,
 *   so do not reach for it to explain a broken redirect. PR #802 did exactly
 *   that; the real cause was an unrelated nuqs URL write.
 *
 * Anything user-visible — `<a href>`, `window.location`, copy-link buttons —
 * wants {@link repoHref} or {@link toDisplayRepoHref} instead. `repo--app` must
 * never reach the address bar.
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
