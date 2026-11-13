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
import { InnerApp } from "./InnerApp";
import "./fonts";
import "./globals.css";

// Moves persisted sandbox UI state off the legacy `conductor:` key prefix. Must
// run before React mounts so the hooks reading these keys see migrated values on
// first render. Remove once the legacy prefix is safely extinct.
migrateLegacyStorageKeys();

/** Close the Convex WebSocket before a reload to stop a cascade of "Not
 * authenticated" server errors. Errors are swallowed: the socket may already
 * be closing, and a failed teardown must still reload. */
function closeConvexBeforeReload() {
  try {
    convex.close();
  } catch {
    // WebSocket may already be closed
  }
}

// After a new Vercel deployment, cached HTML may reference old chunk hashes that
// no longer exist. The shared helper registers the `vite:preloadError`,
// capture-phase `error`, and `unhandledrejection` listeners, strips the
// cache-bust param on boot, and reloads once per cooldown. `_eva_reload` keeps
// the param eva's deployed HTML (index.html) already strips.
installStaleDeployReload({
  reloadParam: STALE_DEPLOY_RELOAD_PARAM,
  onBeforeReload: closeConvexBeforeReload,
});

const router = createRouter({
  routeTree,
  // Redline history builds serve the app under `/__redline/h/<sha>/`; Vite
  // sets BASE_URL from `--base`, so routes resolve inside that prefix. "/" in dev.
  basepath: import.meta.env.BASE_URL,
  history: createAppHistory(),
  context: { isSignedIn: false },
  defaultErrorComponent: DeploymentErrorFallback,
  // Unmatched URLs rendered nothing at all before this — a mistyped or stale
  // link looked like the app had failed to load.
  defaultNotFoundComponent: RouteNotFound,
  // Fetch a route's chunk while the pointer rests on its link, so the click
  // renders from cache instead of waiting on the network. Routes with a
  // side-effecting `beforeLoad` must bail out on the `preload` flag — see
  // `routes/index.tsx` and `routes/_global/home.tsx`.
  defaultPreload: "intent",
  // Twice the 50ms default: long enough that dragging the pointer across a
  // sidebar does not queue a fetch for every item it crosses.
  defaultPreloadDelay: 100,
  // Page swaps fade the content column (`.vt-page` in globals.css). Keyed on
  // the leaf route, so param-only moves — session to session, tab segments,
  // search filters — stay instant. Moves inside one entity (a session's
  // sandbox tabs, its Review sub-tabs) cross leaf routes too, but are tab
  // switches, not page swaps. Returning `false` skips the transition.
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) =>
      fromLocation !== undefined &&
      !isSameEntity(fromLocation.pathname, toLocation.pathname) &&
      leafRouteId(fromLocation.pathname) !== leafRouteId(toLocation.pathname)
        ? ["page"]
        : false,
  },
  // Monorepo apps: address bar + link hrefs use /owner/repo/app/… while the
  // route tree matches /owner/repo--app/… (single $repo segment).
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

/** `/…/sessions/42`, `/…/reviews/884`, … — the entity a path is inside, if any. */
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

// Read once at boot: whether the LAST visit ended signed in. Clerk's session
// handshake costs ~200 kB of clerk-js plus a network round trip, and holding
// first paint on it makes anonymous visitors stare at a blank screen for
// nothing — they have no session to restore.
const hadSession = readSignedInHint();

// The app chrome (sidebar, spotlight search, hotkeys) is a lazy chunk so the
// anonymous landing never downloads it. Returning users need it immediately,
// so start fetching now — it downloads in parallel with Clerk's handshake.
if (hadSession) {
  void import("@/lib/components/AppShellChrome").catch((error: Error) => {
    // This rejection is caught, so it never reaches the `unhandledrejection`
    // listener; reload here with the same claim, teardown and param.
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
        {/* Eva always animates: the animation contract forbids following the
            OS reduced-motion setting. Signed-in users turn page motion off
            with the `disablePageMotion` flag (PageMotionProvider). */}
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
