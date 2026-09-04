"use client";

import { Link, useLocation } from "@tanstack/react-router";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import { decodeRepoParam, KNOWN_REPO_SUB_PAGES } from "@/lib/utils/repoUrl";
import { useUser } from "@clerk/clerk-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { m, AnimatePresence, type PanInfo } from "motion/react";
import {
  IconChevronLeft,
  IconMenu2,
  IconMoon,
  IconSun,
  IconCircleHalf,
  IconX,
} from "@tabler/icons-react";
import { AveHeaderButton } from "@/lib/components/ave/AveHeaderButton";
import { LogoMark } from "@/lib/components/LogoMark";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { api } from "@eva/backend";
import {
  Button,
  cn,
  motionBase,
  motionSpring,
  projectVelocity,
  Spinner,
} from "@eva/ui";
import { RepoRail } from "@/lib/components/sidebar/RepoRail";
import { RepoNavSections } from "@/lib/components/sidebar/RepoNavSections";
import { RepoTopNav } from "@/lib/components/sidebar/RepoTopNav";
import { RepoStatsSummary } from "@/lib/components/sidebar/RepoStatsSummary";
import { OnlineTeamAvatars } from "@/lib/components/sidebar/TeamMembers";
import { SidebarResizeHandle } from "@/lib/components/sidebar/SidebarResizeHandle";
import { ContextSidebarHeaderActionProvider } from "@/lib/components/sidebar/ContextSidebarHeaderAction";
import { AutomationsSidebarOptionsMenu } from "@/lib/components/sidebar/_components/AutomationsSidebarOptionsMenu";
import { SessionsSidebarOptionsMenu } from "@/lib/components/sidebar/_components/SessionsSidebarOptionsMenu";
import { type ContextSidebarMode } from "@/lib/components/sidebar/contextSidebarModes";
import {
  isGlobalSettingsPath,
  isHomePath,
} from "@/lib/components/sidebar/homePaths";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { useThemeContext } from "@/lib/contexts/useThemeContext";
import { usePageTitle } from "@/lib/contexts/PageTitleContext";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";

const KNOWN_SUB_PAGES = KNOWN_REPO_SUB_PAGES;

/** Panel bodies load on demand so unused modes stay off the shell chunk. */
const SettingsSidebar = lazy(() =>
  import("@/lib/components/sidebar/SettingsSidebar").then((m) => ({
    default: m.SettingsSidebar,
  })),
);
const DocsSidebar = lazy(() =>
  import("@/lib/components/sidebar/DocsSidebar").then((m) => ({
    default: m.DocsSidebar,
  })),
);
const ReviewsSidebar = lazy(() =>
  import("@/lib/components/sidebar/ReviewsSidebar").then((m) => ({
    default: m.ReviewsSidebar,
  })),
);
const GlobalSessionsSidebar = lazy(() =>
  import("@/lib/components/sidebar/GlobalSessionsSidebar").then((m) => ({
    default: m.GlobalSessionsSidebar,
  })),
);
const HomeSidebar = lazy(() =>
  import("@/lib/components/sidebar/HomeSidebar").then((m) => ({
    default: m.HomeSidebar,
  })),
);
const TestingArenaSidebar = lazy(() =>
  import("@/lib/components/sidebar/TestingArenaSidebar").then((m) => ({
    default: m.TestingArenaSidebar,
  })),
);
const GlobalAutomationsSidebar = lazy(() =>
  import("@/lib/components/sidebar/GlobalAutomationsSidebar").then((m) => ({
    default: m.GlobalAutomationsSidebar,
  })),
);
const GlobalSettingsSidebar = lazy(() =>
  import("@/lib/components/sidebar/GlobalSettingsSidebar").then((m) => ({
    default: m.GlobalSettingsSidebar,
  })),
);

const sidebarPanelFallback = (
  <div className="flex items-center justify-center py-8">
    <Spinner size="sm" />
  </div>
);

function getInitialContextSidebarMode(pathname: string): ContextSidebarMode {
  const segments = pathname.split("/").filter(Boolean);
  for (let i = 2; i < segments.length; i++) {
    const s = segments[i];
    if (
      s === "settings" ||
      s === "docs" ||
      s === "reviews" ||
      s === "testing-arena"
    ) {
      return s;
    }
  }
  return "main";
}

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
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // The drawer lives above the router, so navigating does not unmount it. Close
  // it here rather than relying on every nested link remembering to call
  // `onNavigate` (adjust-state-during-render, not an effect).
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

  const { repoBasePath, owner, repoName, appName, isRepoRoute } = ((): {
    repoBasePath: string | null;
    owner: string | null;
    repoName: string | null;
    appName: string | undefined;
    isRepoRoute: boolean;
  } => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return {
        repoBasePath: null,
        owner: null,
        repoName: null,
        appName: undefined,
        isRepoRoute: false,
      };
    }
    const o = segments[0];
    const n = segments[1];
    const nonRepoRoutes = new Set([
      "home",
      "sign-in",
      "sign-up",
      "setup",
      "teams",
      "inbox",
      "artifacts",
      "sessions",
      "automations",
      "api",
      "settings",
      "testing",
    ]);
    // Guard non-repo routes before the repo-route heuristic below, otherwise
    // sub-paths like /teams/{id}/members are misread as /owner/repo/appName
    // (because "members" isn't a KNOWN_SUB_PAGE) and the repo nav renders.
    if (nonRepoRoutes.has(o)) {
      return {
        repoBasePath: null,
        owner: null,
        repoName: null,
        appName: undefined,
        isRepoRoute: false,
      };
    }
    if (segments.length >= 3 && !KNOWN_SUB_PAGES.has(segments[2])) {
      return {
        repoBasePath: `/${o}/${n}/${segments[2]}`,
        owner: o,
        repoName: n,
        appName: segments[2],
        isRepoRoute: true,
      };
    }
    const decoded = decodeRepoParam(n);
    return {
      repoBasePath: `/${o}/${n}`,
      owner: o,
      repoName: decoded.name,
      appName: decoded.appName,
      isRepoRoute: true,
    };
  })();

  const pathParts = pathname.split("/").filter(Boolean);
  const isGlobalSessionsLanding =
    pathname === "/sessions" || pathname === "/sessions/";
  // Per-app Sessions sidebar was removed; any sessions URL (landing or deep
  // link like /$owner/$repo/.../sessions/$numId/preview) uses the root list.
  const isRepoSessionsPath = isRepoRoute && pathParts.includes("sessions");
  const isSessionsPath = isGlobalSessionsLanding || isRepoSessionsPath;
  // Experimental Chrome tabs replace the sessions second column (rail only).
  const useChromeSessionTabs = useChromeSessionTabsActive(pathname);
  const showGlobalSessionsPanel = isSessionsPath && !useChromeSessionTabs;
  // Automations mirror Sessions: one cross-repo panel behind the rail entry,
  // shown for the landing page and for every repo-scoped automation URL.
  const isGlobalAutomationsLanding =
    pathname === "/automations" || pathname === "/automations/";
  const isRepoAutomationsPath =
    isRepoRoute && pathParts.includes("automations");
  const showGlobalAutomationsPanel =
    !simpleView && (isGlobalAutomationsLanding || isRepoAutomationsPath);
  const showHomePanel = isHomePath(pathname);
  const showGlobalSettingsPanel =
    isGlobalSettingsPath(pathname) ||
    (import.meta.env.DEV &&
      (pathname === "/testing" || pathname.startsWith("/testing/")));
  const showSidePanel =
    (isRepoRoute && !useChromeSessionTabs) ||
    (isGlobalSessionsLanding && !useChromeSessionTabs) ||
    isGlobalAutomationsLanding ||
    showHomePanel ||
    showGlobalSettingsPanel;

  useEffect(() => {
    if (isGlobalSessionsLanding || isRepoSessionsPath) {
      setSessionsNavMode("global");
    }
  }, [isGlobalSessionsLanding, isRepoSessionsPath, setSessionsNavMode]);

  const showContextSidebar =
    isRepoRoute &&
    !showGlobalSessionsPanel &&
    !showGlobalAutomationsPanel &&
    contextSidebarMode !== "main";

  const repo = useQuery(
    api.githubRepos.getByOwnerAndName,
    owner && repoName ? { owner, name: repoName, appName } : "skip",
  );
  const repoLogoUrl = useQuery(
    api.githubRepos.getLogoUrl,
    repo?._id ? { repoId: repo._id } : "skip",
  );
  const team = useQuery(
    api.teams.get,
    repo?.teamId ? { id: repo.teamId } : "skip",
  );
  const teamBackgroundUrl = team?.backgroundUrl ?? null;

  const sidebarScrollKey =
    owner && repoName
      ? `${owner}/${repoName}${appName ? `/${appName}` : ""}/sidebar/${contextSidebarMode}`
      : `sidebar/${contextSidebarMode}`;
  const { scrollRef: sidebarScrollRef } =
    usePersistedScrollParent(sidebarScrollKey);

  const { theme, toggleTheme } = useThemeContext();

  const closeMobileSidebar = () => setMobileOpen(false);

  const handleMobileDrawerDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (isDesktop || !mobileOpen) return;
    const projected = info.offset.x + projectVelocity(info.velocity.x);
    if (info.offset.x < -72 || info.velocity.x < -500 || projected < -120) {
      closeMobileSidebar();
    }
  };

  // Global panels are a source list: compact title row (like nested Sandboxes),
  // not a 64px page heading and not an empty column.
  const isFlatPanel =
    showGlobalSessionsPanel ||
    showGlobalAutomationsPanel ||
    showHomePanel ||
    showGlobalSettingsPanel;
  const isSourceListHeader = isFlatPanel || showContextSidebar;
  const flatPanelTitle = showGlobalSessionsPanel
    ? "Sessions"
    : showGlobalAutomationsPanel
      ? "Automations"
      : showGlobalSettingsPanel
        ? "Settings"
        : "Home";
  // One key drives the header/nav enter animations and the header-action scope.
  const panelKey = showGlobalSessionsPanel
    ? "global-sessions"
    : showGlobalAutomationsPanel
      ? "global-automations"
      : showGlobalSettingsPanel
        ? "global-settings"
        : showHomePanel
          ? "home"
          : showContextSidebar
            ? contextSidebarMode
            : "main";

  const contextSidebarTitle =
    contextSidebarMode === "settings"
      ? "Settings"
      : contextSidebarMode === "docs"
        ? "Documents"
        : contextSidebarMode === "reviews"
          ? "Reviews"
          : contextSidebarMode === "testing-arena"
            ? "Testing Arena"
            : "";

  // Escape closes the drawer. Opening it leaves focus on the trigger in the
  // header, so the handler has to sit on both regions — the `aside` alone only
  // fires once focus has already moved inside the drawer.
  const closeOnEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !isDesktop && mobileOpen)
      closeMobileSidebar();
  };

  return (
    <>
      <header
        onKeyDown={closeOnEscape}
        className="fixed inset-x-0 top-0 z-30 flex h-(--eva-mobile-header-height) items-center gap-2 bg-background/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-4 lg:hidden"
      >
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="-ml-1 max-sm:shrink-0"
        >
          <IconMenu2 size={20} className="text-muted-foreground" />
        </Button>
        {pageTitle ? (
          <h1 className="mx-auto max-sm:min-w-0 truncate text-base font-semibold tracking-[-0.02em] text-foreground text-balance">
            {pageTitle}
          </h1>
        ) : (
          <Link
            to="/home"
            className="mx-auto flex max-sm:min-w-0 max-sm:shrink-0 items-center gap-2 rounded-surface border border-border bg-muted/40 px-2.5 py-1.5"
          >
            <LogoMark size={26} />
            <span className="text-sm font-semibold tracking-[-0.02em] text-primary">
              Eva
            </span>
          </Link>
        )}
        {/* Manager Ave's summon button lives here below `lg`; the floating
            launcher is desktop-only because it covers the composer's send
            button on a phone. */}
        <AveHeaderButton />
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="shrink-0"
        >
          {theme === "dark" ? (
            <IconSun size={18} className="text-muted-foreground" />
          ) : theme === "neutral" ? (
            <IconMoon size={18} className="text-muted-foreground" />
          ) : (
            <IconCircleHalf size={18} className="text-muted-foreground" />
          )}
        </Button>
      </header>

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
          <div
            className={cn(
              "relative flex h-full min-w-0 flex-1 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar",
              // Keep the drawer content on mobile even when the desktop panel is hidden.
              collapsed && "lg:hidden",
            )}
          >
            <ContextSidebarHeaderActionProvider key={panelKey}>
              {(headerAction) => (
                <>
                  <div
                    className={cn(
                      "relative flex items-center overflow-hidden",
                      // Repo identity keeps a reserved tall slot so team art
                      // resolving later does not shift the nav list (CLS).
                      isSourceListHeader ? "px-2 pt-3" : "h-24 px-3",
                    )}
                  >
                    {teamBackgroundUrl &&
                    !showContextSidebar &&
                    !isFlatPanel ? (
                      <>
                        <img
                          src={teamBackgroundUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                          style={{
                            maskImage:
                              "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
                            WebkitMaskImage:
                              "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
                          }}
                        />
                        <div className="absolute inset-0 bg-linear-to-b from-sidebar/40 via-sidebar/55 to-transparent" />
                      </>
                    ) : null}
                    <m.div
                      key={`${panelKey}-header`}
                      className={cn(
                        "relative z-10 flex w-full items-center",
                        isSourceListHeader && "h-11 px-2",
                        teamBackgroundUrl &&
                          !showContextSidebar &&
                          !isFlatPanel &&
                          "[&_span]:text-sidebar-primary [&_button]:bg-sidebar/50 [&_button]:backdrop-blur-xs",
                      )}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={motionBase}
                    >
                      {isFlatPanel ? (
                        <>
                          <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-[-0.02em] text-sidebar-primary">
                            {flatPanelTitle}
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {showGlobalSessionsPanel ? (
                              <SessionsSidebarOptionsMenu />
                            ) : null}
                            {showGlobalAutomationsPanel ? (
                              <AutomationsSidebarOptionsMenu />
                            ) : null}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="motion-press h-8 w-8 shrink-0 lg:hidden hover:scale-[1.03] active:scale-[0.96]"
                              onClick={closeMobileSidebar}
                              aria-label="Close navigation"
                            >
                              <IconX
                                size={16}
                                className="text-muted-foreground"
                              />
                            </Button>
                          </div>
                        </>
                      ) : showContextSidebar ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setContextSidebarMode("main")}
                            title="Back to main sidebar"
                            aria-label="Back to main sidebar"
                            className="absolute inset-0 rounded-menu-item hover:bg-sidebar-accent/50"
                          />
                          <span className="pointer-events-none relative z-10 flex size-8 shrink-0 items-center justify-center">
                            <IconChevronLeft
                              size={16}
                              className="text-muted-foreground"
                            />
                          </span>
                          <span className="pointer-events-none absolute inset-x-10 inset-y-0 flex items-center justify-center">
                            <span className="max-w-full truncate text-base font-semibold tracking-[-0.02em] text-sidebar-primary">
                              {contextSidebarTitle}
                            </span>
                          </span>
                          <div className="relative z-10 ml-auto flex shrink-0 items-center">
                            {headerAction}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="motion-press h-8 w-8 shrink-0 lg:hidden hover:scale-[1.03] active:scale-[0.96]"
                              onClick={closeMobileSidebar}
                              aria-label="Close navigation"
                            >
                              <IconX
                                size={16}
                                className="text-muted-foreground"
                              />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          {repoName ? (
                            <div
                              className="flex min-w-0 flex-1 items-center justify-center gap-2"
                              title={
                                repo
                                  ? `${repoDisplayLabel(repo)} (${repo.owner}/${repo.name})`
                                  : appName
                                    ? `${repoName} / ${appName}`
                                    : repoName
                              }
                            >
                              {/* Always reserve the logo slot so late logoUrl does not reflow the title. */}
                              <RepoLogo
                                logoUrl={repoLogoUrl}
                                size={28}
                                fallback={
                                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                                    {(repo
                                      ? repoDisplayLabel(repo)
                                      : (repoName ?? "?")
                                    )
                                      .charAt(0)
                                      .toUpperCase()}
                                  </span>
                                }
                              />
                              <span className="min-w-0 truncate text-lg font-medium text-sidebar-primary">
                                {repo
                                  ? repoDisplayLabel(repo)
                                  : appName
                                    ? `${repoName} / ${appName}`
                                    : repoName}
                              </span>
                            </div>
                          ) : null}

                          <Button
                            size="icon"
                            variant="ghost"
                            className="motion-press shrink-0 lg:hidden hover:scale-[1.03] active:scale-[0.96]"
                            onClick={closeMobileSidebar}
                            aria-label="Close navigation"
                          >
                            <IconX
                              size={18}
                              className="text-muted-foreground"
                            />
                          </Button>
                        </>
                      )}
                    </m.div>
                  </div>

                  <nav
                    ref={sidebarScrollRef}
                    className={cn(
                      "scrollbar scroll-fade flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-2",
                      isSourceListHeader ? "pb-2 pt-1.5" : "py-2",
                    )}
                  >
                    <div
                      className={
                        showGlobalSessionsPanel || showGlobalAutomationsPanel
                          ? "space-y-0"
                          : "space-y-4"
                      }
                    >
                      <m.div
                        key={`${panelKey}-nav`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={motionBase}
                      >
                        <Suspense fallback={sidebarPanelFallback}>
                          {showGlobalSessionsPanel ? (
                            <GlobalSessionsSidebar
                              pathname={pathname}
                              onNavigate={closeMobileSidebar}
                            />
                          ) : showGlobalAutomationsPanel ? (
                            <GlobalAutomationsSidebar
                              pathname={pathname}
                              onNavigate={closeMobileSidebar}
                            />
                          ) : showHomePanel ? (
                            <HomeSidebar
                              pathname={pathname}
                              onNavigate={closeMobileSidebar}
                            />
                          ) : showGlobalSettingsPanel ? (
                            <GlobalSettingsSidebar
                              pathname={pathname}
                              onNavigate={closeMobileSidebar}
                            />
                          ) : showContextSidebar ? (
                            contextSidebarMode === "settings" ? (
                              <SettingsSidebar
                                basePath={repoBasePath ?? ""}
                                pathname={pathname}
                                onNavigate={closeMobileSidebar}
                              />
                            ) : repo && repoBasePath ? (
                              contextSidebarMode === "docs" ? (
                                <DocsSidebar
                                  repoId={repo._id}
                                  basePath={repoBasePath}
                                  pathname={pathname}
                                  onNavigate={closeMobileSidebar}
                                />
                              ) : contextSidebarMode === "reviews" ? (
                                <ReviewsSidebar
                                  repoId={repo._id}
                                  basePath={repoBasePath}
                                  pathname={pathname}
                                  onNavigate={closeMobileSidebar}
                                />
                              ) : (
                                <TestingArenaSidebar
                                  repoId={repo._id}
                                  basePath={repoBasePath}
                                  pathname={pathname}
                                  onNavigate={closeMobileSidebar}
                                />
                              )
                            ) : (
                              sidebarPanelFallback
                            )
                          ) : repoBasePath ? (
                            <div className="space-y-4">
                              <RepoTopNav
                                repoBasePath={repoBasePath}
                                pathname={pathname}
                                collapsed={false}
                                repo={repo}
                                onNavigate={closeMobileSidebar}
                              />
                              <RepoNavSections
                                repoBasePath={repoBasePath}
                                pathname={pathname}
                                collapsed={false}
                                repo={repo}
                                onOpenContextSidebar={(mode) => {
                                  setContextSidebarMode(mode);
                                }}
                                onNavigate={closeMobileSidebar}
                              />
                            </div>
                          ) : null}
                        </Suspense>
                      </m.div>
                    </div>
                  </nav>

                  {/* Main/context keep stats+avatars; sessions/automations only
                      hide the cook-rate block — online teammates stay visible. */}
                  {showGlobalSessionsPanel || showGlobalAutomationsPanel ? (
                    <div className="px-6 py-3">
                      <OnlineTeamAvatars collapsed={false} />
                    </div>
                  ) : isRepoRoute && repoBasePath ? (
                    <div className="px-6 py-3">
                      <RepoStatsSummary
                        repo={repo}
                        repoBasePath={repoBasePath}
                        collapsed={false}
                      />
                    </div>
                  ) : null}
                  {!collapsed ? (
                    <SidebarResizeHandle
                      width={sidebarWidth}
                      onWidthPreview={previewSidebarWidth}
                      onWidthCommit={commitSidebarWidth}
                      onWidthChange={setSidebarWidth}
                    />
                  ) : null}
                </>
              )}
            </ContextSidebarHeaderActionProvider>
          </div>
        ) : null}
      </m.aside>
    </>
  );
}
