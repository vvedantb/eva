import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SetupBanner } from "@/lib/components/SetupBanner";
import { SessionChromeTabsBar } from "@/lib/components/sidebar/session-tabs/SessionChromeTabsBar";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { SHELL_VIEWPORT_ROUTE_CLASS } from "@/lib/components/sidebar/shellLayout";
import { RepoProvider, RepoGate } from "@/lib/contexts/RepoContext";
import { LiveCursors } from "@/lib/components/LiveCursors";
import { IS_EMBEDDED } from "@/lib/embed/embedded";
import { cn } from "@eva/ui";

export const Route = createFileRoute("/_repo/$owner/$repo")({
  component: RepoLayoutInner,
});

function MainContent({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const chromeSessionTabs = useChromeSessionTabsActive(pathname);

  return (
    <div
      className={cn(
        "relative flex flex-col",
        SHELL_VIEWPORT_ROUTE_CLASS,
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
      {IS_EMBEDDED ? null : <LiveCursors />}
    </RepoProvider>
  );
}
