/** localStorage key for Sessions sidebar sort / preview prefs. */
export const SESSIONS_SIDEBAR_SETTINGS_KEY = "eva:sessions-sidebar-settings:v1";

/** Per-app expand/collapse in global Sessions sidebar + chrome tabs. */
export const SESSIONS_APP_GROUPS_OPEN_KEY = "eva:sessions-app-groups-open:v1";

export const APP_SORT_ORDERS = ["updated_at", "created_at", "manual"] as const;
export type AppSortOrder = (typeof APP_SORT_ORDERS)[number];

export const SESSION_SORT_ORDERS = ["updated_at", "created_at"] as const;
export type SessionSortOrder = (typeof SESSION_SORT_ORDERS)[number];

const SESSION_LIST_MODES = ["active", "archived"] as const;
export type SessionListMode = (typeof SESSION_LIST_MODES)[number];

/** Row density: single-line list vs two-line folder. */
export const SESSION_LAYOUTS = ["list", "folder"] as const;
export type SessionLayout = (typeof SESSION_LAYOUTS)[number];

export const SESSION_LAYOUT_LABELS: Record<SessionLayout, string> = {
  list: "List",
  folder: "Folder",
};

export const MIN_SESSION_PREVIEW_COUNT = 2;
export const MAX_SESSION_PREVIEW_COUNT = 10;
export const DEFAULT_SESSION_PREVIEW_COUNT = 3;

export const APP_SORT_LABELS: Record<AppSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};

export const SESSION_SORT_LABELS: Record<SessionSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
};

export interface SessionsSidebarSettings {
  appSortOrder: AppSortOrder;
  sessionSortOrder: SessionSortOrder;
  sessionPreviewCount: number;
  listMode: SessionListMode;
  layout: SessionLayout;
}

export const DEFAULT_SESSIONS_SIDEBAR_SETTINGS: SessionsSidebarSettings = {
  appSortOrder: "updated_at",
  sessionSortOrder: "updated_at",
  sessionPreviewCount: DEFAULT_SESSION_PREVIEW_COUNT,
  listMode: "active",
  layout: "list",
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

export function clampSessionPreviewCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SESSION_PREVIEW_COUNT;
  return Math.min(
    MAX_SESSION_PREVIEW_COUNT,
    Math.max(MIN_SESSION_PREVIEW_COUNT, Math.round(value)),
  );
}

/** Activity timestamp for sidebar session rows. */
export function sessionActivityAt(session: {
  updatedAt?: number;
  _creationTime: number;
}): number {
  return session.updatedAt ?? session._creationTime;
}

/**
 * Orders a repo's sessions for any sidebar list. Every sidebar surface (global
 * list, chrome tabs, session switcher) sorts through it.
 */
export function sortSessionsForSidebar<
  T extends { updatedAt?: number; _creationTime: number },
>(sessions: T[], order: SessionSortOrder): T[] {
  if (order === "updated_at") {
    return sessions.toSorted(
      (a, b) => sessionActivityAt(b) - sessionActivityAt(a),
    );
  }
  return sessions.toSorted((a, b) => b._creationTime - a._creationTime);
}

export function sortAppsForSidebar<
  T extends { _id: string; _creationTime: number },
>(
  apps: T[],
  order: AppSortOrder,
  latestActivityByAppId: ReadonlyMap<string, number>,
): T[] {
  if (order === "manual") return apps;
  if (order === "created_at") {
    return apps.toSorted((a, b) => b._creationTime - a._creationTime);
  }
  return apps.toSorted((a, b) => {
    const aAt = latestActivityByAppId.get(a._id) ?? a._creationTime;
    const bAt = latestActivityByAppId.get(b._id) ?? b._creationTime;
    return bAt - aAt;
  });
}
