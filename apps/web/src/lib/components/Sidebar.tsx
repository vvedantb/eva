"use client";

import { useLocation, useMatches } from "@tanstack/react-router";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { m, AnimatePresence } from "motion/react";
import { api } from "@eva/backend";
import { cn, motionBase, motionSpring } from "@eva/ui";
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
import { useMobileSidebarDrawer } from "@/lib/components/sidebar/useMobileSidebarDrawer";
import { useSidebarRepoData } from "@/lib/components/sidebar/useSidebarRepoData";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { useThemeContext } from "@/lib/contexts/useThemeContext";
import { usePageTitle } from "@/lib/contexts/PageTitleContext";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

export function Sidebar() {
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
    sidebarWidth,
    setSidebarWidth,
    previewSidebarWidth,
    commitSidebarWidth,
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
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const { closeMobileSidebar, handleMobileDrawerDragEnd, closeOnEscape } =
    useMobileSidebarDrawer({ pathname, isDesktop, mobileOpen, setMobileOpen });

  useShortcut("toggleSidebar", (e) => {
    e.preventDefault();
    setCollapsed(!collapsed);
  });
  const simpleView = useSimpleView();
  const [storedContextSidebarMode, setContextSidebarMode] =
    useState<ContextSidebarMode>(() => getInitialContextSidebarMode(pathname));
  const contextSidebarMode =
    simpleView && storedContextSidebarMode === "reviews"
      ? "main"
      : storedContextSidebarMode;

  // Sidebar now persists across sections, so re-derive the context sidebar mode on navigation.
  useEffect(() => {
    setContextSidebarMode(getInitialContextSidebarMode(pathname));
  }, [pathname]);

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
    <>
      <SidebarMobileHeader
        title={mobileHeaderTitle}
        theme={theme}
        onToggleTheme={toggleTheme}
        setMobileOpen={setMobileOpen}
        onKeyDown={closeOnEscape}
      />

      <AnimatePresence initial={false}>
        {mobileOpen && (
          <m.button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-background/62 lg:hidden"
            onClick={closeMobileSidebar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionBase}
          />
        )}
      </AnimatePresence>

      <m.aside
        // Off-screen below `lg` when closed: `inert` keeps its links out of the
        // tab order and the accessibility tree instead of leaving a focusable
        // drawer parked outside the viewport.
        inert={!isDesktop && !mobileOpen}
        onKeyDown={closeOnEscape}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] lg:py-0",
          // Global pages are rail-only except Sessions (grouped cross-repo list).
          // Collapsed = hide the secondary panel entirely (rail only on lg+).
          showSidePanel
            ? cn(
                "w-[min(20rem,calc(100vw-1.5rem))]",
                collapsed ? "lg:w-16" : "lg:w-(--eva-sidebar-width,20rem)",
              )
            : "w-16",
        )}
        initial={false}
        animate={{ x: isDesktop || mobileOpen ? 0 : "-100%" }}
        transition={motionSpring}
        drag={!isDesktop && mobileOpen ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.45, right: 0.08 }}
        onDragEnd={handleMobileDrawerDragEnd}
      >
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
            collapsed={collapsed}
            sidebarWidth={sidebarWidth}
            previewSidebarWidth={previewSidebarWidth}
            commitSidebarWidth={commitSidebarWidth}
            setSidebarWidth={setSidebarWidth}
          />
        ) : null}
      </m.aside>
    </>
  );
}
