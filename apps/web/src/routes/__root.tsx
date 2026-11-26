import { lazy, Suspense } from "react";
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { NuqsAdapter } from "@/lib/nuqsTanstackAdapter";
import { Analytics } from "@vercel/analytics/react";
import { TooltipProvider } from "@vvedantb/ui";
import { ClientProvider } from "@/lib/components/ClientProvider";
import { AppToaster } from "@/lib/components/AppToaster";
import { AppShell } from "@/lib/components/AppShell";
import { PreviewIframeHost } from "@/lib/components/sandbox/previewIframeHost";
import { PreviewMiniPlayer } from "@/lib/components/sandbox/PreviewMiniPlayer";
import { ChangelogDialogGate } from "@/lib/components/ChangelogDialogGate";
import { IS_EMBEDDED } from "@/lib/embed/embedded";
import { EmbedNavigationBridge } from "@/lib/embed/EmbedNavigationBridge";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { PrCloseDialogHost } from "@/lib/components/pr-menu/PrCloseDialogHost";

export interface RouterContext {
  isSignedIn: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

const DevAgentation = import.meta.env.DEV
  ? lazy(() =>
      import("@/lib/components/DevAgentation").then((m) => ({
        default: m.DevAgentation,
      })),
    )
  : null;

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

  const anonymousLanding = pathname === "/" && isSignedIn !== true;

  const app = (
    <>
      <NuqsAdapter>
        <AppShell>
          <Outlet />
        </AppShell>
        <PreviewMiniPlayer />
        <PreviewIframeHost />
      </NuqsAdapter>
      {IS_EMBEDDED ? <EmbedNavigationBridge /> : null}
      <AppToaster />
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

  return (
    <TooltipProvider>
      {anonymousLanding ? (
        app
      ) : (
        <ClientProvider>
          {app}
          {IS_EMBEDDED ? null : <ChangelogDialogGate />}
          <PrCloseDialogHost />
        </ClientProvider>
      )}
    </TooltipProvider>
  );
}
