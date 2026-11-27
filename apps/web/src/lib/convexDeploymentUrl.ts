/** Hostnames that can only ever mean "the machine this code is running on". */
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Path the sandbox preview proxy forwards to the sandbox's Convex backend,
 * WebSocket upgrades included. `vite/convexDevProxy.ts` serves the same path off
 * the dev server so it resolves on either origin.
 */
const PROXIED_CONVEX_PATH = "/__convex";

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/** Convex concatenates `${address}/api/…`, so a trailing slash doubles it. */
function withoutTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Where this page should reach Convex, given the configured address and the
 * origin the page was served from.
 *
 * A sandbox runs its own Convex backend and writes that backend's address into
 * the app env verbatim — `http://127.0.0.1:3210`. That is right for anything
 * running inside the sandbox, but a browser on another machine resolves loopback
 * to itself, so the sync socket fails (`WebSocket closed with code 1006`) and
 * the app never leaves its loading screen. A loopback address cannot be meant
 * for a page that is not itself on loopback, so those pages go through
 * `PROXIED_CONVEX_PATH` on their own origin instead.
 *
 * A relative address is honoured as-is, and deployed builds point at
 * `.convex.cloud`, so neither is touched.
 */
export function convexDeploymentUrl(
  configured: string,
  pageOrigin: string,
): string {
  const resolved = new URL(configured, pageOrigin);
  const reachable =
    !isLoopback(resolved.hostname) || isLoopback(new URL(pageOrigin).hostname);
  return withoutTrailingSlash(
    reachable
      ? resolved.toString()
      : new URL(PROXIED_CONVEX_PATH, pageOrigin).toString(),
  );
}
