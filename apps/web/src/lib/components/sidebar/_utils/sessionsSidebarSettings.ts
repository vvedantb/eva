import {
  APP_SORT_ORDERS,
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

// The sort orders and sort helpers live in `@eva/shared`, which the phone
// Sessions tab shares; this module stays the web's one import for them.
export {
  APP_SORT_ORDERS,
  SESSION_SORT_ORDERS,
  type AppSortOrder,
  type SessionSortOrder,
};
export {
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
  layout: SessionLayout;
  /** Hide sessions another teammate started. */
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

export function clampSessionPreviewCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SESSION_PREVIEW_COUNT;
  return Math.min(
    MAX_SESSION_PREVIEW_COUNT,
    Math.max(MIN_SESSION_PREVIEW_COUNT, Math.round(value)),
  );
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

/** The user who started a session; older rows have no `createdBy`. */
function sessionStartedBy<T extends string>(session: {
  userId: T;
  createdBy?: T;
}): T {
  return session.createdBy ?? session.userId;
}

/**
 * Keeps only sessions `userId` started. Stays `undefined` (loading) while the
 * rows or the current user are still loading.
 */
export function filterSessionsStartedBy<
  T extends { userId: string; createdBy?: string },
>(sessions: T[] | undefined, userId: string | undefined): T[] | undefined {
  if (sessions === undefined || userId === undefined) return undefined;
  return sessions.filter((session) => sessionStartedBy(session) === userId);
}
