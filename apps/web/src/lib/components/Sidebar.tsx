"use client";

import { useLocation, useMatches } from "@tanstack/react-router";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import { useUser } from "@clerk/clerk-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  AppShell,
  Sidebar as ShellSidebar,
  useMediaQuery,
} from "@vvedantb/ui";
import { RepoRail } from "@/lib/components/sidebar/RepoRail";
import { SidebarMobileHeader } from "@/lib/components/sidebar/_components/SidebarMobileHeader";
import { SidebarPanel } from "@/lib/components/sidebar/_components/SidebarPanel";
import { type ContextSidebarMode } from "@/lib/components/sidebar/contextSidebarModes";
import {
  getInitialContextSidebarMode,
  getSidebarPanelFlags,
  getSidebarPanelKey,
  getSidebarScrollKey,
  parseSidebarRepoRoute,
} from "@/lib/components/sidebar/sidebarPanelState";
import { SIDEBAR_RESIZE } from "@/lib/components/sidebar/shellLayout";
import { useSidebarRepoData } from "@/lib/components/sidebar/useSidebarRepoData";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { useThemeContext } from "@/lib/contexts/useThemeContext";
import { usePageTitle } from "@/lib/contexts/PageTitleContext";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

/**
 * The app shell: the package `AppShell` and `Sidebar` parts own the rail width,
 * the panel layout, the resize handle and the mobile drawer. Eva supplies the
 * rail tiles, the panel content and the mobile header content.
 */
export function Sidebar({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useUser();
  const {
    collapsed,
    setCollapsed,
    // Context-owned so the "select something from the sidebar" landing pages
    // can open the drawer from their empty state (`OpenNavigationButton`).
    mobileOpen,
    setMobileOpen,
    setSessionsNavMode,
  } = useSidebar();
  const { pageTitle } = usePageTitle();
  // Entity pages (a session, a project, a pull request) title themselves with
  // a breadcrumb rather than a string, so `pageTitle` is empty there and the
  // header used to fall back to the logo — no "where am I" on a phone. The
  // route's section label (the same `staticData.title` the browser tab uses)
  // fills that gap; the logo is only for routes that declare neither.
  const routeTitle = useMatches({
    select: (matches) =>
      matches.reduce<string>(
        (deepest, match) => match.staticData.title ?? deepest,
        "",
      ),
  });
  const mobileHeaderTitle = pageTitle || routeTitle;
  // The package shell uses the `md` breakpoint.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const closeMobileSidebar = () => setMobileOpen(false);
  // A route change closes the drawer (the package leaves this to the app).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useShortcut("toggleSidebar", (e) => {
    e.preventDefault();
    setCollapsed(!collapsed);
  });
  const simpleView = useSimpleView();
  // The pathname owns the context sidebar mode; a user pick only overrides it
  // on the page where it was made, so navigating re-derives it.
  const [modeOverride, setModeOverride] = useState<{
    pathname: string;
    mode: ContextSidebarMode;
  } | null>(null);
  const storedContextSidebarMode =
    modeOverride?.pathname === pathname
      ? modeOverride.mode
      : getInitialContextSidebarMode(pathname);
  const contextSidebarMode =
    simpleView && storedContextSidebarMode === "reviews"
      ? "main"
      : storedContextSidebarMode;
  const setContextSidebarMode = (mode: ContextSidebarMode) =>
    setModeOverride({ pathname, mode });

  const repos = useQuery(api.githubRepos.list, {});

  const route = parseSidebarRepoRoute(pathname);
  const { owner, repoName, appName, isRepoRoute } = route;

  // Experimental Chrome tabs replace the sessions second column (rail only).
  const useChromeSessionTabs = useChromeSessionTabsActive(pathname);
  const flags = getSidebarPanelFlags({
    pathname,
    isRepoRoute,
    simpleView,
    useChromeSessionTabs,
    contextSidebarMode,
  });
  const { isGlobalSessionsLanding, isRepoSessionsPath, showSidePanel } = flags;

  useEffect(() => {
    if (isGlobalSessionsLanding || isRepoSessionsPath) {
      setSessionsNavMode("global");
    }
  }, [isGlobalSessionsLanding, isRepoSessionsPath, setSessionsNavMode]);

  const { repo, repoLogoUrl, teamBackgroundUrl } = useSidebarRepoData(
    owner,
    repoName,
    appName,
  );

  const { scrollRef: sidebarScrollRef } = usePersistedScrollParent(
    getSidebarScrollKey(route, contextSidebarMode),
  );

  const { theme, toggleTheme } = useThemeContext();

  const panelKey = getSidebarPanelKey(flags, contextSidebarMode);

  return (
    <AppShell.Root
      scroll="document"
      resizable={SIDEBAR_RESIZE}
      // Collapsed, or a route with no side panel: the content sits next to the rail.
      panelHidden={collapsed || !showSidePanel}
      className="bg-app-shell"
    >
      <AppShell.SkipLink />
      <ShellSidebar.Root
        isDesktop={isDesktop}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        collapsed={collapsed}
        // Global pages are rail only, except Sessions (grouped cross-repo list).
        panelHidden={!showSidePanel}
      >
        <SidebarMobileHeader
          title={mobileHeaderTitle}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <ShellSidebar.Backdrop />
        <ShellSidebar.Aside>
          <RepoRail
            repos={repos ?? []}
            currentOwner={owner}
            currentName={repoName}
            currentAppName={appName}
            pathname={pathname}
            onNavigate={closeMobileSidebar}
            userName={user?.fullName || user?.firstName || "User"}
            showSearch={isRepoRoute}
          />
          {showSidePanel ? (
            <SidebarPanel
              panelKey={panelKey}
              flags={flags}
              contextSidebarMode={contextSidebarMode}
              setContextSidebarMode={setContextSidebarMode}
              pathname={pathname}
              route={route}
              repo={repo}
              repoLogoUrl={repoLogoUrl}
              teamBackgroundUrl={teamBackgroundUrl}
              scrollRef={sidebarScrollRef}
              onNavigate={closeMobileSidebar}
            />
          ) : null}
          <ShellSidebar.ResizeHandle />
        </ShellSidebar.Aside>
      </ShellSidebar.Root>
      <AppShell.Main>
        <AppShell.Content>{children}</AppShell.Content>
      </AppShell.Main>
    </AppShell.Root>
  );
}
