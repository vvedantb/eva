import { MotionProvider } from "@vvedantb/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/clerk-react";
import { queryClient } from "./lib/queryClient";
import { routeTree } from "./routeTree.gen";
import { createAppHistory } from "./lib/history";
import { toDisplayRepoHref, toInternalRepoHref } from "./lib/utils/repoUrl";
import { clientEnv } from "./env/client";
import { convex } from "./lib/convex";
import { DeploymentErrorFallback } from "./lib/components/DeploymentErrorFallback";
import { RouteNotFound } from "./lib/components/RouteNotFound";
import { EvaUiProvider } from "@eva/ui";
import {
  claimStaleDeployReload,
  installStaleDeployReload,
  isChunkLoadError,
  reloadForStaleDeploy,
} from "@vvedantb/ui/client";
import { STALE_DEPLOY_RELOAD_PARAM } from "./lib/utils/staleDeployReloadParam";
import { readSignedInHint } from "./lib/authHint";
import { migrateLegacyStorageKeys } from "./lib/migrateLegacyStorageKeys";
import { takeNavDirection } from "./lib/railNavDirection";
import { InnerApp } from "./InnerApp";
import "./fonts";
import "./globals.css";

migrateLegacyStorageKeys();

function closeConvexBeforeReload() {
  try {
    convex.close();
  } catch {
  }
}

installStaleDeployReload({
  reloadParam: STALE_DEPLOY_RELOAD_PARAM,
  onBeforeReload: closeConvexBeforeReload,
});

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  history: createAppHistory(),
  context: { isSignedIn: false },
  defaultErrorComponent: DeploymentErrorFallback,
  defaultNotFoundComponent: RouteNotFound,
  defaultPreload: "intent",
  defaultPreloadDelay: 100,
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) => {
      if (fromLocation === undefined) return false;
      const nav = takeNavDirection();
      if (nav?.source === "rail") return ["page", `rail-${nav.direction}`];
      const pageSwap =
        !isSameEntity(fromLocation.pathname, toLocation.pathname) &&
        leafRouteId(fromLocation.pathname) !== leafRouteId(toLocation.pathname);
      if (!pageSwap) return false;
      return nav ? ["page", `nav-${nav.direction}`] : ["page"];
    },
  },
  rewrite: {
    input: ({ url }) => {
      url.pathname = toInternalRepoHref(url.pathname);
      return url;
    },
    output: ({ url }) => {
      url.pathname = toDisplayRepoHref(url.pathname);
      return url;
    },
  },
});

const ENTITY_PREFIX =
  /^(.*?\/(?:sessions|quick-tasks|projects|reviews|docs|testing-arena)\/[^/]+)(?:\/|$)/;

function isSameEntity(from: string, to: string): boolean {
  const entity = ENTITY_PREFIX.exec(from)?.[1];
  return entity !== undefined && entity === ENTITY_PREFIX.exec(to)?.[1];
}

function leafRouteId(pathname: string): string | undefined {
  return router.getMatchedRoutes(pathname).foundRoute?.id;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const hadSession = readSignedInHint();

if (hadSession) {
  void import("@/lib/components/AppShellChrome").catch((error: Error) => {
    if (!isChunkLoadError(error)) return;
    if (!claimStaleDeployReload()) return;
    closeConvexBeforeReload();
    reloadForStaleDeploy({ reloadParam: STALE_DEPLOY_RELOAD_PARAM });
  });
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MotionProvider reducedMotion="never">
          <EvaUiProvider>
            <ClerkProvider
              publishableKey={clientEnv.VITE_CLERK_PUBLISHABLE_KEY}
              signInFallbackRedirectUrl="/home"
              signUpFallbackRedirectUrl="/home"
            >
              <InnerApp hadSession={hadSession} router={router} />
            </ClerkProvider>
          </EvaUiProvider>
        </MotionProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
