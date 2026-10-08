import { lazy, Suspense } from "react";
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { Analytics } from "@vercel/analytics/react";
import { TooltipProvider } from "@eva/ui";
import { ClientProvider } from "@/lib/components/ClientProvider";
import { AppToaster } from "@/lib/components/AppToaster";
import { AppShell } from "@/lib/components/AppShell";
import { PreviewIframeHost } from "@/lib/components/sandbox/previewIframeHost";
import { PreviewMiniPlayer } from "@/lib/components/sandbox/PreviewMiniPlayer";
import { ChangelogDialogGate } from "@/lib/components/ChangelogDialogGate";
import { IS_EMBEDDED } from "@/lib/embed/embedded";
import { EmbedNavigationBridge } from "@/lib/embed/EmbedNavigationBridge";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

/** Lazy so the agentation package stays out of the production bundle. */
const DevAgentation = import.meta.env.DEV
  ? lazy(() =>
      import("@/lib/components/DevAgentation").then((m) => ({
        default: m.DevAgentation,
      })),
    )
  : null;

/** Lazy so @vvedantb/redline stays out of the production bundle. */
const DevRedline = import.meta.env.DEV
  ? lazy(() =>
      import("@/lib/components/DevRedline").then((m) => ({
        default: m.DevRedline,
      })),
    )
  : null;

function RootComponent() {
  useDocumentTitle();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isSignedIn } = useAuth();

  // The anonymous landing is the one route that needs no Convex. Skipping the
  // provider there keeps marketing visitors from opening a WebSocket to the
  // production deployment (ClientProvider's presence/user bootstrapping and
  // ChangelogDialogGate each subscribe immediately on mount). Every other
  // public route (preview-auth, mcp/oauth/authorize) calls Convex hooks
  // unconditionally, so they keep the provider even when signed out.
  const anonymousLanding = pathname === "/" && isSignedIn !== true;

  const app = (
    <>
      <NuqsAdapter>
        <AppShell>
          <Outlet />
        </AppShell>
        {/* The floating preview window sits on the host's z layer and just
            before it in DOM order, so the hosted iframe paints over its body. */}
        <PreviewMiniPlayer />
        {/* Preview iframes survive ALL route changes by living here, outside
            the router. Mounted after AppShell so equal-z fixed layers paint
            above routed content; Radix portals (z-50) still stack above. */}
        <PreviewIframeHost />
      </NuqsAdapter>
      {IS_EMBEDDED ? <EmbedNavigationBridge /> : null}
      <AppToaster />
      {/* No analytics from embedded documents: the host page already counts. */}
      {IS_EMBEDDED ? null : <Analytics />}
      {DevAgentation ? (
        <Suspense fallback={null}>
          <DevAgentation />
        </Suspense>
      ) : null}
      {DevRedline ? (
        <Suspense fallback={null}>
          <DevRedline />
        </Suspense>
      ) : null}
    </>
  );

  // One provider above everything, including the layers outside the app shell:
  // the preview mini player, the What's New dialog and the routes without
  // chrome (preview-auth, mcp/oauth) all render tooltips, and Radix throws
  // outright when a Tooltip has no Provider above it. Context only — no DOM,
  // so the anonymous landing pays nothing for it.
  return (
    <TooltipProvider>
      {anonymousLanding ? (
        app
      ) : (
        <ClientProvider>
          {app}
          {/* The What's New dialog belongs to the top-level window, not previews. */}
          {IS_EMBEDDED ? null : <ChangelogDialogGate />}
        </ClientProvider>
      )}
    </TooltipProvider>
  );
}
