import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SetupBanner } from "@/lib/components/SetupBanner";
import { SessionChromeTabsBar } from "@/lib/components/sidebar/session-tabs/SessionChromeTabsBar";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { RepoProvider, RepoGate } from "@/lib/contexts/RepoContext";
import { LiveCursors } from "@/lib/components/LiveCursors";
import { IS_EMBEDDED } from "@/lib/embed/embedded";
import { cn } from "@eva/ui";

export const Route = createFileRoute("/_repo/$owner/$repo")({
  component: RepoLayoutInner,
});

function MainContent({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  const { pathname } = useLocation();
  const chromeSessionTabs = useChromeSessionTabsActive(pathname);
  // Chrome tabs hide the sessions second column — pad for rail only.
  const railOnly = collapsed || chromeSessionTabs;

  return (
    <div
      className={cn(
        // `h-dvh`, not `h-screen`: with `overflow-hidden` on the shell, a `100vh`
        // height on iOS pushes the bottom of every repo page under the browser
        // chrome with no way to scroll to it.
        "relative flex h-dvh flex-col overflow-hidden",
        // Embedded documents (inbox preview pane) have no sidebar or mobile
        // top bar to pad for. The top pad tracks the below-`lg` header in
        // `Sidebar.tsx`, which is 3.5rem *plus* the notch inset. Default 20rem
        // matches prior lg:pl-80 until localStorage hydrates.
        IS_EMBEDDED
          ? null
          : [
              "pt-(--eva-mobile-header-height) lg:pt-0",
              railOnly ? "lg:pl-16" : "lg:pl-(--eva-sidebar-width,20rem)",
            ],
      )}
    >
      <div className="relative flex h-full flex-col overflow-hidden bg-background">
        {chromeSessionTabs ? (
          <SessionChromeTabsBar pathname={pathname} />
        ) : null}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

function RepoLayoutInner() {
  const { owner, repo } = Route.useParams();

  return (
    <RepoProvider owner={owner} repoParam={repo}>
      <MainContent>
        <RepoGate>
          <SetupBanner />
          <div className="vt-page flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </div>
        </RepoGate>
      </MainContent>
      {/* The host window already draws cursors; a second layer would double them. */}
      {IS_EMBEDDED ? null : <LiveCursors />}
    </RepoProvider>
  );
}
