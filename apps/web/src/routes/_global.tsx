import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { isGlobalSettingsPath } from "@/lib/components/sidebar/homePaths";
import { SessionChromeTabsBar } from "@/lib/components/sidebar/session-tabs/SessionChromeTabsBar";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import {
  SHELL_DOCUMENT_ROUTE_CLASS,
  SHELL_VIEWPORT_ROUTE_CLASS,
} from "@/lib/components/sidebar/shellLayout";
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
  const isSessionsLanding =
    pathname === "/sessions" || pathname === "/sessions/";
  const chromeSessionTabs = useChromeSessionTabsActive(pathname);
  const isAvePath = pathname === "/ave" || pathname.startsWith("/ave/");
  const isInbox = pathname === "/inbox" || pathname.startsWith("/inbox/");

  return (
    <div
      className={cn(
        "relative flex flex-col",
        isInbox || isAvePath
          ? SHELL_VIEWPORT_ROUTE_CLASS
          : SHELL_DOCUMENT_ROUTE_CLASS,
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
