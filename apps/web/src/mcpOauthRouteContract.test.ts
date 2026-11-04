import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { repoSectionFromPath, toInternalRepoHref } from "./lib/utils/repoUrl";

/**
 * Eva's MCP OAuth server (Convex `authorizeGet`) 302s to
 * `WEB_APP_URL/mcp/oauth/authorize`. When that route file was deleted, the
 * Vercel SPA fallback still served index.html and TanStack matched
 * `/$owner/$repo` (owner `mcp`, repo `oauth`): MCP clients saw "Can't open
 * mcp/oauth" and never got a code. These checks keep the consent page routed.
 */

const srcDir = dirname(fileURLToPath(import.meta.url));
const AUTHORIZE_PATH = "/mcp/oauth/authorize";

describe("MCP OAuth consent route", () => {
  test("is a generated top-level route, not swallowed by /$owner/$repo", () => {
    const tree = readFileSync(join(srcDir, "routeTree.gen.ts"), "utf8");
    expect(tree).toContain(
      "import { Route as McpOauthAuthorizeRouteImport } from './routes/mcp/oauth/authorize'",
    );
    expect(tree).toMatch(
      /McpOauthAuthorizeRouteImport\.update\(\{\s*id: '\/mcp\/oauth\/authorize',\s*path: '\/mcp\/oauth\/authorize',\s*getParentRoute: \(\) => rootRouteImport,/,
    );
  });

  test("a static authorize route outranks the dynamic repo route", () => {
    const root = createRootRoute();
    const repo = createRoute({
      getParentRoute: () => root,
      path: "/$owner/$repo",
    });
    const authorize = createRoute({
      getParentRoute: () => root,
      path: AUTHORIZE_PATH,
    });
    const router = createRouter({
      routeTree: root.addChildren([repo, authorize]),
      history: createMemoryHistory({ initialEntries: [AUTHORIZE_PATH] }),
    });
    const leaf = router.matchRoutes(AUTHORIZE_PATH, {}).at(-1);
    expect(leaf?.routeId).toBe(AUTHORIZE_PATH);
  });

  test("the repo URL rewrite leaves the authorize path alone", () => {
    const href = `${AUTHORIZE_PATH}?client_id=c&state=s`;
    expect(toInternalRepoHref(href)).toBe(href);
    expect(repoSectionFromPath(AUTHORIZE_PATH)).toBeNull();
  });

  test("Vercel serves the SPA for the authorize path", () => {
    const vercel = z
      .object({
        rewrites: z.array(
          z.object({ source: z.string(), destination: z.string() }),
        ),
      })
      .parse(
        JSON.parse(readFileSync(join(srcDir, "../vercel.json"), "utf8")),
      );
    const spa = vercel.rewrites.find((r) => r.destination === "/index.html");
    expect(spa).toBeDefined();
    // Vercel `source` is a path-to-regexp pattern; the SPA one is a plain
    // regex group, so it can be checked directly.
    const pattern = new RegExp(`^${spa?.source ?? "$^"}$`);
    expect(pattern.test(AUTHORIZE_PATH)).toBe(true);
  });
});
