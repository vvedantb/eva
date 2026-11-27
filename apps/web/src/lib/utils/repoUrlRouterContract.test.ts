import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, test } from "bun:test";
import { toDisplayRepoHref, toInternalRepoHref } from "./repoUrl";

const DISPLAY: string = "/vvedantb/eva/web/sessions/236/preview";
const INTERNAL: string = "/vvedantb/eva--web/sessions/236/preview";
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

async function navigatedRouteId(target: string): Promise<string | undefined> {
  const router = routerAt("/");
  await router.load();
  await router.navigate({ to: target });
  const matches = router.state.matches;
  return matches[matches.length - 1]?.routeId;
}

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
  test.each([DISPLAY, INTERNAL, PLAIN])("%s", (href) => {
    const once = toInternalRepoHref(href);
    expect(toInternalRepoHref(once)).toBe(once);
  });
});
