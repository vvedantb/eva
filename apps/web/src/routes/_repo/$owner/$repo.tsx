import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SetupBanner } from "@/lib/components/SetupBanner";
import { SessionChromeTabsBar } from "@/lib/components/sidebar/session-tabs/SessionChromeTabsBar";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import {
  SHELL_CONTENT_CARD_CLASS,
  useSidebarContentOffset,
} from "@/lib/components/sidebar/useSidebarContentOffset";
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
  const contentOffset = useSidebarContentOffset();

  return (
    <div
      className={cn(
        // `h-dvh`, not `h-screen`: with `overflow-hidden` on the shell, a `100vh`
        // height on iOS pushes the bottom of every repo page under the browser
        // chrome with no way to scroll to it.
        "relative flex h-dvh flex-col overflow-hidden",
        contentOffset,
      )}
    >
      <div
        className={cn(
          "relative flex h-full flex-col overflow-hidden",
          SHELL_CONTENT_CARD_CLASS,
        )}
      >
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
