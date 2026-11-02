"use client";

import { useLocalStorage } from "usehooks-ts";
import {
  clampSessionPreviewCount,
  DEFAULT_SESSIONS_SIDEBAR_SETTINGS,
  isAppSortOrder,
  isSessionLayout,
  isSessionSortOrder,
  SESSIONS_SIDEBAR_SETTINGS_KEY,
  type AppSortOrder,
  type SessionLayout,
  type SessionSortOrder,
  type SessionsSidebarSettings,
} from "./_utils/sessionsSidebarSettings";

function parseSettings(raw: SessionsSidebarSettings): SessionsSidebarSettings {
  const appSortOrder = isAppSortOrder(raw.appSortOrder)
    ? raw.appSortOrder
    : DEFAULT_SESSIONS_SIDEBAR_SETTINGS.appSortOrder;
  const sessionSortOrder = isSessionSortOrder(raw.sessionSortOrder)
    ? raw.sessionSortOrder
    : DEFAULT_SESSIONS_SIDEBAR_SETTINGS.sessionSortOrder;
  const layout =
    typeof raw.layout === "string" && isSessionLayout(raw.layout)
      ? raw.layout
      : DEFAULT_SESSIONS_SIDEBAR_SETTINGS.layout;
  return {
    appSortOrder,
    sessionSortOrder,
    sessionPreviewCount: clampSessionPreviewCount(raw.sessionPreviewCount),
    layout,
    onlyMine: raw.onlyMine === true,
  };
}

/** Persisted Sessions sidebar sort / preview prefs (t3code-style options). */
export function useSessionsSidebarSettings() {
  const [raw, setRaw] = useLocalStorage<SessionsSidebarSettings>(
    SESSIONS_SIDEBAR_SETTINGS_KEY,
    DEFAULT_SESSIONS_SIDEBAR_SETTINGS,
  );
  const settings = parseSettings(raw);

  return {
    settings,
    setAppSortOrder: (appSortOrder: AppSortOrder) => {
      setRaw((prev) => ({ ...parseSettings(prev), appSortOrder }));
    },
    setSessionSortOrder: (sessionSortOrder: SessionSortOrder) => {
      setRaw((prev) => ({ ...parseSettings(prev), sessionSortOrder }));
    },
    setSessionPreviewCount: (sessionPreviewCount: number) => {
      setRaw((prev) => ({
        ...parseSettings(prev),
        sessionPreviewCount: clampSessionPreviewCount(sessionPreviewCount),
      }));
    },
    setLayout: (layout: SessionLayout) => {
      setRaw((prev) => ({ ...parseSettings(prev), layout }));
    },
    setOnlyMine: (onlyMine: boolean) => {
      setRaw((prev) => ({ ...parseSettings(prev), onlyMine }));
    },
  };
}
