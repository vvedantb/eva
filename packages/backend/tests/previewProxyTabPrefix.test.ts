import { describe, expect, test } from "vitest";
import {
  extractFunctionSource,
  previewProxySource,
} from "./_helpers/previewProxySource";

/**
 * Vercel exposes four fixed ports and the preview auth proxy owns the public
 * one, so a custom tab (Supabase Studio on 54323, say) used to relaunch the
 * proxy onto its own upstream and clobber the Preview tab. Tabs now ride the
 * same proxy under `/__tab/<port>`, which forwards to that in-sandbox port,
 * rewrites its redirects and its root-relative HTML back under the prefix, and
 * falls back to the Referer for root-absolute asset requests.
 *
 * As with the other preview-proxy tests, the functions below are the exact
 * shipped source lifted out of the generated script template.
 */

interface Route {
  port: number;
  path: string;
  injects: boolean;
  tabPrefix: string | null;
}

const TARGET_PORT = 13000;
const PROXY_PORT = 3000;
const TAB_PORT = 54323;

const routingFactory = new Function(
  "targetPort",
  "proxyPort",
  [
    'const TAB_PREFIX = "/__tab";',
    'const CONVEX_PREFIX = "/__convex";',
    'const CONVEX_SITE_PREFIX = "/__convex-site";',
    'const AGENTATION_PREFIX = "/__agentation";',
    "const CONVEX_PORT = 3210;",
    "const CONVEX_SITE_PORT = 3211;",
    "const AGENTATION_PORT = 4747;",
    "const INJECT_ENABLED = true;",
    extractFunctionSource("function matchPrefix(url, prefix) {"),
    extractFunctionSource("function matchTabPrefix(url) {"),
    extractFunctionSource("function resolveRoute(url) {"),
    extractFunctionSource("function resolveRouteWithReferer(url, headers) {"),
    "return resolveRouteWithReferer;",
  ].join("\n\n"),
);
const resolveRouteWithReferer: (
  url: string,
  headers: Record<string, string>,
) => Route = routingFactory(TARGET_PORT, PROXY_PORT);

const locationFactory = new Function(
  [
    'const VERCEL_HOST_SUFFIX = ".vercel.run";',
    extractFunctionSource("function rewriteLocationHeader(value, route) {"),
    "return rewriteLocationHeader;",
  ].join("\n\n"),
);
const rewriteLocationHeader: (value: string, route: Route) => string =
  locationFactory();

/** The skip-list regex is a const, not a function, so slice it by hand. */
const tabSkipRegexStart = previewProxySource.indexOf(
  "const TAB_SKIP_PREFIX_RE",
);
const tabSkipRegexSource = previewProxySource.slice(
  tabSkipRegexStart,
  previewProxySource.indexOf(";", tabSkipRegexStart) + 1,
);

const htmlFactory = new Function(
  [
    'const NOVNC_CDN_RFB = "https://cdn.example.test/rfb.js";',
    "function injectHtml(html) { return html; }",
    extractFunctionSource("function stripModuleCrossorigin(html) {"),
    extractFunctionSource("function rewriteNovncModuleImports(html) {"),
    tabSkipRegexSource,
    extractFunctionSource("function prefixTabPath(value, tabPrefix) {"),
    extractFunctionSource("function rewriteTabHtml(html, tabPrefix) {"),
    extractFunctionSource("function rewriteHtml(html, injects, tabPrefix) {"),
    "return rewriteHtml;",
  ].join("\n\n"),
);
const rewriteHtml: (
  html: string,
  injects: boolean,
  tabPrefix: string | null,
) => string = htmlFactory();

const TAB_ROUTE: Route = {
  port: TAB_PORT,
  path: "/",
  injects: false,
  tabPrefix: `/__tab/${TAB_PORT}`,
};

describe("preview proxy /__tab/<port> routing", () => {
  test("forwards to the tab port with the prefix stripped", () => {
    expect(resolveRouteWithReferer("/__tab/54323/foo?x=1", {})).toEqual({
      port: 54323,
      path: "/foo?x=1",
      injects: false,
      tabPrefix: "/__tab/54323",
    });
  });

  test("the bare prefix maps to the upstream root", () => {
    expect(resolveRouteWithReferer("/__tab/54323", {}).path).toBe("/");
    expect(resolveRouteWithReferer("/__tab/54323/", {}).path).toBe("/");
  });

  test("tab routes never inject the nav-sync script", () => {
    expect(resolveRouteWithReferer("/__tab/54323/", {}).injects).toBe(false);
  });

  test("the proxy's own port falls through instead of looping back", () => {
    expect(resolveRouteWithReferer("/__tab/3000/", {})).toEqual({
      port: TARGET_PORT,
      path: "/__tab/3000/",
      injects: true,
      tabPrefix: null,
    });
  });

  test("a malformed or out-of-range port falls through to the dev server", () => {
    for (const url of ["/__tab/abc", "/__tab/", "/__tab", "/__tab/99999/x"]) {
      const route = resolveRouteWithReferer(url, {});
      expect(route.port).toBe(TARGET_PORT);
      expect(route.tabPrefix).toBe(null);
      expect(route.path).toBe(url);
    }
  });

  test("the Convex prefixes still win", () => {
    expect(resolveRouteWithReferer("/__convex/api/sync", {}).port).toBe(3210);
    expect(resolveRouteWithReferer("/__convex-site/x", {}).port).toBe(3211);
  });
});

describe("preview proxy Referer fallback for root-absolute tab assets", () => {
  test("a /_next asset requested from a tab page goes to the tab port", () => {
    expect(
      resolveRouteWithReferer("/_next/static/a.js", {
        referer: "https://sandy-3000.vercel.run/__tab/54323/",
      }),
    ).toEqual({
      port: 54323,
      path: "/_next/static/a.js",
      injects: false,
      tabPrefix: "/__tab/54323",
    });
  });

  test("a Referer without a tab prefix leaves the dev-server route alone", () => {
    const route = resolveRouteWithReferer("/_next/static/a.js", {
      referer: "https://sandy-3000.vercel.run/dashboard",
    });
    expect(route.port).toBe(TARGET_PORT);
    expect(route.tabPrefix).toBe(null);
  });

  test("a missing or unparseable Referer leaves the route alone", () => {
    expect(resolveRouteWithReferer("/x", {}).port).toBe(TARGET_PORT);
    expect(resolveRouteWithReferer("/x", { referer: "not a url" }).port).toBe(
      TARGET_PORT,
    );
  });

  test("an explicit prefix is never overridden by the Referer", () => {
    expect(
      resolveRouteWithReferer("/__convex/api/sync", {
        referer: "https://sandy-3000.vercel.run/__tab/54323/",
      }).port,
    ).toBe(3210);
  });
});

describe("preview proxy tab redirects", () => {
  test("a path-only Location from the tab upstream keeps the prefix", () => {
    expect(rewriteLocationHeader("/login", TAB_ROUTE)).toBe(
      "/__tab/54323/login",
    );
  });

  test("an absolute loopback Location on the tab port is prefixed too", () => {
    expect(
      rewriteLocationHeader("http://127.0.0.1:54323/login?next=/x", TAB_ROUTE),
    ).toBe("/__tab/54323/login?next=/x");
  });

  test("a Location already under the prefix is not double-prefixed", () => {
    expect(rewriteLocationHeader("/__tab/54323/login", TAB_ROUTE)).toBe(
      "/__tab/54323/login",
    );
  });

  test("an external Location is untouched", () => {
    expect(rewriteLocationHeader("https://example.com/x", TAB_ROUTE)).toBe(
      "https://example.com/x",
    );
  });

  test("the dev-server route behaves exactly as before", () => {
    const devRoute: Route = {
      port: TARGET_PORT,
      path: "/",
      injects: true,
      tabPrefix: null,
    };
    expect(
      rewriteLocationHeader(`http://127.0.0.1:${TARGET_PORT}/login`, devRoute),
    ).toBe("/login");
    expect(rewriteLocationHeader("/login", devRoute)).toBe("/login");
  });
});

describe("preview proxy tab HTML rewrite", () => {
  const prefix = `/__tab/${TAB_PORT}`;

  test("root-relative src/href/action move under the prefix", () => {
    expect(
      rewriteHtml(
        '<script src="/a.js"></script><a href="/dash">d</a>' +
          '<form action="/submit"></form>',
        false,
        prefix,
      ),
    ).toBe(
      '<script src="/__tab/54323/a.js"></script>' +
        '<a href="/__tab/54323/dash">d</a>' +
        '<form action="/__tab/54323/submit"></form>',
    );
  });

  test("srcset entries are rewritten with their descriptors kept", () => {
    expect(
      rewriteHtml('<img srcset="/a.png 1x, /b.png 2x">', false, prefix),
    ).toBe('<img srcset="/__tab/54323/a.png 1x, /__tab/54323/b.png 2x">');
  });

  test("protocol-relative, absolute and proxy-owned URLs are untouched", () => {
    const html =
      '<link href="//cdn/x"><script src="/__convex/x"></script>' +
      '<a href="https://example.com/x">e</a><a href="relative/x">r</a>' +
      '<script src="/__tab/54323/already.js"></script>';
    expect(rewriteHtml(html, false, prefix)).toBe(html);
  });

  test("the dev-server route leaves root-relative URLs alone", () => {
    expect(rewriteHtml('<script src="/a.js"></script>', false, null)).toBe(
      '<script src="/a.js"></script>',
    );
  });
});
