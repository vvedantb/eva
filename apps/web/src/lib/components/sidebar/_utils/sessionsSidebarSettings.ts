import {
  APP_SORT_ORDERS,
  clampSessionPreviewCount,
  DEFAULT_SESSION_PREVIEW_COUNT,
  SESSION_SORT_ORDERS,
  type AppSortOrder,
  type SessionSortOrder,
} from "@eva/shared";

/** localStorage key for Sessions sidebar sort / preview prefs. */
export const SESSIONS_SIDEBAR_SETTINGS_KEY = "eva:sessions-sidebar-settings:v1";

/** Per-app expand/collapse in global Sessions sidebar + chrome tabs. */
export const SESSIONS_APP_GROUPS_OPEN_KEY = "eva:sessions-app-groups-open:v1";

/** Per-group expand/collapse for linked-session groups in the Sessions sidebar. */
export const LINKED_SESSION_GROUPS_OPEN_KEY =
  "eva:linked-session-groups-open:v1";

export {
  APP_SORT_ORDERS,
  SESSION_SORT_ORDERS,
  type AppSortOrder,
  type SessionSortOrder,
};
export { clampSessionPreviewCount, DEFAULT_SESSION_PREVIEW_COUNT };
export {
  APP_SORT_LABELS,
  filterSessionsStartedBy,
  MAX_SESSION_PREVIEW_COUNT,
  MIN_SESSION_PREVIEW_COUNT,
  SESSION_SORT_LABELS,
  sessionActivityAt,
  sortAppsForSidebar,
  sortSessionsForSidebar,
} from "@eva/shared";

const SESSION_LIST_MODES = ["active", "archived"] as const;
export type SessionListMode = (typeof SESSION_LIST_MODES)[number];

/** Row density: single-line list vs two-line folder. */
export const SESSION_LAYOUTS = ["list", "folder"] as const;
export type SessionLayout = (typeof SESSION_LAYOUTS)[number];

export const SESSION_LAYOUT_LABELS: Record<SessionLayout, string> = {
  list: "List",
  folder: "Folder",
};

export interface SessionsSidebarSettings {
  appSortOrder: AppSortOrder;
  sessionSortOrder: SessionSortOrder;
  sessionPreviewCount: number;
  layout: SessionLayout;
  onlyMine: boolean;
}

export const DEFAULT_SESSIONS_SIDEBAR_SETTINGS: SessionsSidebarSettings = {
  appSortOrder: "updated_at",
  sessionSortOrder: "updated_at",
  sessionPreviewCount: DEFAULT_SESSION_PREVIEW_COUNT,
  layout: "list",
  onlyMine: false,
};

export function isAppSortOrder(value: string): value is AppSortOrder {
  for (const order of APP_SORT_ORDERS) {
    if (order === value) return true;
  }
  return false;
}

export function isSessionSortOrder(value: string): value is SessionSortOrder {
  for (const order of SESSION_SORT_ORDERS) {
    if (order === value) return true;
  }
  return false;
}

export function isSessionListMode(value: string): value is SessionListMode {
  for (const mode of SESSION_LIST_MODES) {
    if (mode === value) return true;
  }
  return false;
}

export function isSessionLayout(value: string): value is SessionLayout {
  for (const layout of SESSION_LAYOUTS) {
    if (layout === value) return true;
  }
  return false;
}


/**
 * Normalises stored prefs. Builds a fresh object so stale keys from older
 * versions (for example `listMode`, which is no longer persisted) drop out.
 */
export function parseSessionsSidebarSettings(
  raw: SessionsSidebarSettings,
): SessionsSidebarSettings {
  return {
    appSortOrder: isAppSortOrder(raw.appSortOrder)
      ? raw.appSortOrder
      : DEFAULT_SESSIONS_SIDEBAR_SETTINGS.appSortOrder,
    sessionSortOrder: isSessionSortOrder(raw.sessionSortOrder)
      ? raw.sessionSortOrder
      : DEFAULT_SESSIONS_SIDEBAR_SETTINGS.sessionSortOrder,
    sessionPreviewCount: clampSessionPreviewCount(raw.sessionPreviewCount),
    layout:
      typeof raw.layout === "string" && isSessionLayout(raw.layout)
        ? raw.layout
        : DEFAULT_SESSIONS_SIDEBAR_SETTINGS.layout,
    onlyMine: raw.onlyMine === true,
  };
}
