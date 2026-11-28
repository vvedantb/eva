import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { decodeRepoParam, KNOWN_REPO_SUB_PAGES } from "@/lib/utils/repoUrl";
import { type ContextSidebarMode } from "@/lib/components/sidebar/contextSidebarModes";
import {
  isGlobalSettingsPath,
  isHomePath,
} from "@/lib/components/sidebar/homePaths";

const KNOWN_SUB_PAGES = KNOWN_REPO_SUB_PAGES;

export function getInitialContextSidebarMode(
  pathname: string,
): ContextSidebarMode {
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

export interface SidebarRepoRoute {
  repoBasePath: string | null;
  owner: string | null;
  repoName: string | null;
  appName: string | undefined;
  isRepoRoute: boolean;
}

/** The repo the sidebar is scoped to, as `githubRepos.getByOwnerAndName` returns it. */
export type RepoDoc = FunctionReturnType<
  typeof api.githubRepos.getByOwnerAndName
>;

const NON_REPO_ROUTE: SidebarRepoRoute = {
  repoBasePath: null,
  owner: null,
  repoName: null,
  appName: undefined,
  isRepoRoute: false,
};

const NON_REPO_ROUTES = new Set([
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

/** Reads the repo (and optional app) the sidebar is scoped to from the URL. */
export function parseSidebarRepoRoute(pathname: string): SidebarRepoRoute {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return { ...NON_REPO_ROUTE };
  }
  const o = segments[0];
  const n = segments[1];
  if (NON_REPO_ROUTES.has(o)) {
    return { ...NON_REPO_ROUTE };
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
}

interface SidebarPanelInput {
  pathname: string;
  isRepoRoute: boolean;
  simpleView: boolean;
  useChromeSessionTabs: boolean;
  contextSidebarMode: ContextSidebarMode;
}

export interface SidebarPanelFlags {
  isGlobalSessionsLanding: boolean;
  isRepoSessionsPath: boolean;
  showGlobalSessionsPanel: boolean;
  showGlobalAutomationsPanel: boolean;
  showHomePanel: boolean;
  showGlobalSettingsPanel: boolean;
  showSidePanel: boolean;
  showContextSidebar: boolean;
  isFlatPanel: boolean;
  isSourceListHeader: boolean;
}

const isLandingPath = (pathname: string, root: string) =>
  pathname === root || pathname === `${root}/`;

function isGlobalSettingsPanelPath(pathname: string): boolean {
  return (
    isGlobalSettingsPath(pathname) ||
    (import.meta.env.DEV &&
      (pathname === "/testing" || pathname.startsWith("/testing/")))
  );
}

/**
 * Whether the route has a second column beside the rail. Shared by `Sidebar`
 * (which renders it and tells the package `AppShell` to offset the content
 * for it), so the two cannot drift.
 */
export function routeHasSidePanel({
  pathname,
  isRepoRoute,
  useChromeSessionTabs,
}: Pick<
  SidebarPanelInput,
  "pathname" | "isRepoRoute" | "useChromeSessionTabs"
>): boolean {
  return (
    ((isRepoRoute || isLandingPath(pathname, "/sessions")) &&
      !useChromeSessionTabs) ||
    isLandingPath(pathname, "/automations") ||
    isHomePath(pathname) ||
    isGlobalSettingsPanelPath(pathname)
  );
}

function getGlobalPanelFlags({
  pathname,
  isRepoRoute,
  simpleView,
  useChromeSessionTabs,
}: SidebarPanelInput) {
  const pathParts = pathname.split("/").filter(Boolean);
  const isGlobalSessionsLanding = isLandingPath(pathname, "/sessions");
  const isRepoSessionsPath = isRepoRoute && pathParts.includes("sessions");
  const isSessionsPath = isGlobalSessionsLanding || isRepoSessionsPath;
  const showGlobalSessionsPanel = isSessionsPath && !useChromeSessionTabs;
  const isRepoAutomationsPath =
    isRepoRoute && pathParts.includes("automations");
  const showGlobalAutomationsPanel =
    !simpleView &&
    (isLandingPath(pathname, "/automations") || isRepoAutomationsPath);
  return {
    isGlobalSessionsLanding,
    isRepoSessionsPath,
    showGlobalSessionsPanel,
    showGlobalAutomationsPanel,
    showHomePanel: isHomePath(pathname),
    showGlobalSettingsPanel: isGlobalSettingsPanelPath(pathname),
  };
}

/** Which sidebar panel shows for the current route. */
export function getSidebarPanelFlags(
  input: SidebarPanelInput,
): SidebarPanelFlags {
  const { isRepoRoute, contextSidebarMode } = input;
  const globalFlags = getGlobalPanelFlags(input);
  const {
    showGlobalSessionsPanel,
    showGlobalAutomationsPanel,
    showHomePanel,
    showGlobalSettingsPanel,
  } = globalFlags;
  const showSidePanel = routeHasSidePanel(input);
  const showContextSidebar =
    isRepoRoute &&
    !showGlobalSessionsPanel &&
    !showGlobalAutomationsPanel &&
    contextSidebarMode !== "main";
  const isFlatPanel =
    showGlobalSessionsPanel ||
    showGlobalAutomationsPanel ||
    showHomePanel ||
    showGlobalSettingsPanel;
  const isSourceListHeader = isFlatPanel || showContextSidebar;
  return {
    ...globalFlags,
    showSidePanel,
    showContextSidebar,
    isFlatPanel,
    isSourceListHeader,
  };
}

export function getFlatPanelTitle(flags: SidebarPanelFlags): string {
  return flags.showGlobalSessionsPanel
    ? "Sessions"
    : flags.showGlobalAutomationsPanel
      ? "Automations"
      : flags.showGlobalSettingsPanel
        ? "Settings"
        : "Home";
}

/** One key drives the header/nav enter animations and the header-action scope. */
export function getSidebarPanelKey(
  flags: SidebarPanelFlags,
  contextSidebarMode: ContextSidebarMode,
): string {
  return flags.showGlobalSessionsPanel
    ? "global-sessions"
    : flags.showGlobalAutomationsPanel
      ? "global-automations"
      : flags.showGlobalSettingsPanel
        ? "global-settings"
        : flags.showHomePanel
          ? "home"
          : flags.showContextSidebar
            ? contextSidebarMode
            : "main";
}

export function getContextSidebarTitle(
  contextSidebarMode: ContextSidebarMode,
): string {
  return contextSidebarMode === "settings"
    ? "Settings"
    : contextSidebarMode === "docs"
      ? "Documents"
      : contextSidebarMode === "reviews"
        ? "Reviews"
        : contextSidebarMode === "testing-arena"
          ? "Testing Arena"
          : "";
}

export function getSidebarScrollKey(
  { owner, repoName, appName }: SidebarRepoRoute,
  contextSidebarMode: ContextSidebarMode,
): string {
  return owner && repoName
    ? `${owner}/${repoName}${appName ? `/${appName}` : ""}/sidebar/${contextSidebarMode}`
    : `sidebar/${contextSidebarMode}`;
}
