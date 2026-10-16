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
  // Guard non-repo routes before the repo-route heuristic below, otherwise
  // sub-paths like /teams/{id}/members are misread as /owner/repo/appName
  // (because "members" isn't a KNOWN_SUB_PAGE) and the repo nav renders.
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

function getGlobalPanelFlags({
  pathname,
  isRepoRoute,
  simpleView,
  useChromeSessionTabs,
}: SidebarPanelInput) {
  const pathParts = pathname.split("/").filter(Boolean);
  const isGlobalSessionsLanding =
    pathname === "/sessions" || pathname === "/sessions/";
  // Per-app Sessions sidebar was removed; any sessions URL (landing or deep
  // link like /$owner/$repo/.../sessions/$numId/preview) uses the root list.
  const isRepoSessionsPath = isRepoRoute && pathParts.includes("sessions");
  const isSessionsPath = isGlobalSessionsLanding || isRepoSessionsPath;
  // Experimental Chrome tabs replace the sessions second column (rail only).
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
  return {
    isGlobalSessionsLanding,
    isRepoSessionsPath,
    showGlobalSessionsPanel,
    isGlobalAutomationsLanding,
    showGlobalAutomationsPanel,
    showHomePanel,
    showGlobalSettingsPanel,
  };
}

/** Which sidebar panel shows for the current route. */
export function getSidebarPanelFlags(
  input: SidebarPanelInput,
): SidebarPanelFlags {
  const { isRepoRoute, useChromeSessionTabs, contextSidebarMode } = input;
  const { isGlobalAutomationsLanding, ...globalFlags } =
    getGlobalPanelFlags(input);
  const {
    isGlobalSessionsLanding,
    showGlobalSessionsPanel,
    showGlobalAutomationsPanel,
    showHomePanel,
    showGlobalSettingsPanel,
  } = globalFlags;
  const showSidePanel =
    (isRepoRoute && !useChromeSessionTabs) ||
    (isGlobalSessionsLanding && !useChromeSessionTabs) ||
    isGlobalAutomationsLanding ||
    showHomePanel ||
    showGlobalSettingsPanel;
  const showContextSidebar =
    isRepoRoute &&
    !showGlobalSessionsPanel &&
    !showGlobalAutomationsPanel &&
    contextSidebarMode !== "main";
  // Global panels are a source list: compact title row (like nested Sandboxes),
  // not a 64px page heading and not an empty column.
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
