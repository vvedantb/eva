import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { isGlobalSettingsPath } from "@/lib/components/sidebar/homePaths";
import { SessionChromeTabsBar } from "@/lib/components/sidebar/session-tabs/SessionChromeTabsBar";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { useSidebarContentOffset } from "@/lib/components/sidebar/useSidebarContentOffset";
import { cn } from "@eva/ui";

export const Route = createFileRoute("/_global")({
  beforeLoad: ({ context }) => {
    if (!context.isSignedIn) {
      throw redirect({ to: "/" });
    }
  },
  staticData: { appShell: true },
  component: GlobalMainContent,
});

function GlobalMainContent() {
  const { pathname } = useLocation();
  const contentOffset = useSidebarContentOffset();
  const isSessionsLanding =
    pathname === "/sessions" || pathname === "/sessions/";
  const chromeSessionTabs = useChromeSessionTabsActive(pathname);
  // Manager Ave's chat is a virtualized session surface: it needs a
  // viewport-clamped shell (like `_repo/$owner/$repo.tsx`'s `h-dvh
  // overflow-hidden`), not this layout's content-sized `min-h-dvh` column —
  // an unclamped ancestor makes the chat virtualizer's measure loop diverge,
  // growing the page by hundreds of px per second.
  const isAvePath = pathname === "/ave" || pathname.startsWith("/ave/");
  // The two-pane inbox is an app surface (viewport-bound, full-bleed) like the
  // repo shell, not a scrolling document page like the rest of _global.
  const isInbox = pathname === "/inbox" || pathname.startsWith("/inbox/");

  return (
    <div
      className={cn(
        "relative flex flex-col",
        // Ave's chat is a virtualized session surface like the inbox: both need
        // a viewport-clamped shell, not a content-sized scrolling column.
        isInbox || isAvePath ? "h-dvh overflow-hidden" : "min-h-dvh",
        contentOffset,
      )}
    >
      <div
        className={cn(
          "relative flex flex-1 flex-col bg-background",
          (isInbox || isAvePath) && "min-h-0 overflow-hidden",
        )}
      >
        {chromeSessionTabs && isSessionsLanding ? (
          <SessionChromeTabsBar pathname={pathname} />
        ) : null}
        <div
          className={cn(
            "vt-page",
            isInbox || isAvePath
              ? "relative z-10 flex w-full min-h-0 flex-1 flex-col overflow-hidden"
              : isGlobalSettingsPath(pathname)
                ? "relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col"
                : "relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8",
          )}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
