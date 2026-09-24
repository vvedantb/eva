import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, test } from "vitest";
import { toDisplayRepoHref, toInternalRepoHref } from "./repoUrl";

/**
 * What the router rewrite covers, and what it does not.
 *
 * `basePath` (RepoContext) is the display form — `/owner/repo/app` for a
 * monorepo app — while the route tree matches the single-segment
 * `/owner/repo--app`. `main.tsx` installs a rewrite to bridge the two, and call
 * sites additionally wrap destinations in {@link toInternalRepoHref}.
 *
 * Whether that hand-wrapping is needed differs by call site, which is what this
 * file pins down. It is not obvious, and guessing wrong has already cost two
 * bugs: the 2026-08-04 URL-scheme change missed a call site (harmless, as it
 * turns out), and PR #802 then "fixed" an unrelated redirect by adding that
 * wrapper back — a misdiagnosis, since the real cause was a nuqs URL write.
 *
 * The two paths are modelled as the router itself reaches them:
 * - a navigation commits through history, where `rewrite.input` runs;
 * - a `<Link>` resolves its target against the route tree directly, which never
 *   crosses that boundary.
 */

/** Monorepo app, display form — what `basePath` yields. */
const DISPLAY: string = "/vvedantb/eva/web/sessions/236/preview";
/** The same target, internal form — what `toInternalRepoHref` yields. */
const INTERNAL: string = "/vvedantb/eva--web/sessions/236/preview";
/** A plain (non-monorepo) repo, where `toInternalRepoHref` is a no-op. */
const PLAIN: string = "/vvedantb/eva/sessions/236/preview";

const root = createRootRoute({ component: () => null });
const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: () => null,
});
const sandboxTab = createRoute({
  getParentRoute: () => root,
  path: "/$owner/$repo/sessions/$numId/$sandboxTab",
  component: () => null,
});
const routeTree = root.addChildren([home, sandboxTab]);

/** A router carrying the same rewrite as `main.tsx`, started at `entry`. */
function routerAt(entry: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [entry] }),
    rewrite: {
      input: ({ url }: { url: URL }) => {
        url.pathname = toInternalRepoHref(url.pathname);
        return url;
      },
      output: ({ url }: { url: URL }) => {
        url.pathname = toDisplayRepoHref(url.pathname);
        return url;
      },
    },
  });
}

/**
 * Where a navigation to `target` lands — a real `navigate({ to })` from a
 * neutral start, which commits through history where `rewrite.input` runs.
 *
 * Note `to` is a route path, not a browser URL: pushing an internal-form URL
 * onto history directly does NOT match, because the rewrite contract expects
 * incoming browser URLs in display form. That difference is why this goes
 * through `navigate` rather than `history.push`.
 */
async function navigatedRouteId(target: string): Promise<string | undefined> {
  const router = routerAt("/");
  await router.load();
  await router.navigate({ to: target });
  const matches = router.state.matches;
  return matches[matches.length - 1]?.routeId;
}

/** What a `<Link>` to `pathname` resolves to: matched directly, no rewrite. */
function linkRouteId(pathname: string): string | undefined {
  const matches = routerAt("/").matchRoutes(pathname);
  return matches[matches.length - 1]?.routeId;
}

describe("a navigation does not need toInternalRepoHref", () => {
  test.each([
    ["display form", DISPLAY],
    ["internal form", INTERNAL],
    ["plain repo", PLAIN],
  ])("%s resolves to the sandbox-tab route", async (_label, entry) => {
    expect(await navigatedRouteId(entry)).toBe(sandboxTab.id);
  });

  test("both monorepo forms land on the same location", async () => {
    const fromDisplay = routerAt("/");
    const fromInternal = routerAt("/");
    await fromDisplay.load();
    await fromInternal.load();
    await fromDisplay.navigate({ to: DISPLAY });
    await fromInternal.navigate({ to: INTERNAL });
    expect(fromDisplay.state.location.pathname).toBe(
      fromInternal.state.location.pathname,
    );
  });
});

describe("a <Link> DOES need toInternalRepoHref", () => {
  /**
   * The asymmetry. A display-form Link target matches no route, so everything
   * keyed off the match stops working — active styling, and the
   * `defaultPreload: "intent"` prefetch. The click itself still navigates,
   * because that goes through history where the rewrite runs, which is what
   * makes the breakage quiet.
   *
   * So the wrapper is redundant at navigation call sites but load-bearing at
   * Link call sites. Do not "simplify" by stripping it from Links.
   */
  test("display form resolves to no route", () => {
    expect(linkRouteId(DISPLAY)).not.toBe(sandboxTab.id);
  });

  test("internal form resolves to the sandbox-tab route", () => {
    expect(linkRouteId(INTERNAL)).toBe(sandboxTab.id);
  });

  test("wrapping the display form is what rescues it", () => {
    expect(linkRouteId(toInternalRepoHref(DISPLAY))).toBe(sandboxTab.id);
  });

  test("a plain repo needs no wrapping either way", () => {
    expect(toInternalRepoHref(PLAIN)).toBe(PLAIN);
    expect(linkRouteId(PLAIN)).toBe(sandboxTab.id);
  });
});

describe("toInternalRepoHref is idempotent", () => {
  // Call sites wrap, and the rewrite wraps again on the way through history,
  // so double application has to be a no-op.
  test.each([DISPLAY, INTERNAL, PLAIN])("%s", (href) => {
    const once = toInternalRepoHref(href);
    expect(toInternalRepoHref(once)).toBe(once);
  });
});
