"use client";

import { useLocalStorage } from "usehooks-ts";
import {
  clampSessionPreviewCount,
  DEFAULT_SESSIONS_SIDEBAR_SETTINGS,
  parseSessionsSidebarSettings,
  SESSIONS_SIDEBAR_SETTINGS_KEY,
  type AppSortOrder,
  type SessionLayout,
  type SessionSortOrder,
  type SessionsSidebarSettings,
} from "./_utils/sessionsSidebarSettings";

/** Persisted Sessions sidebar sort / preview prefs (t3code-style options). */
export function useSessionsSidebarSettings() {
  const [raw, setRaw] = useLocalStorage<SessionsSidebarSettings>(
    SESSIONS_SIDEBAR_SETTINGS_KEY,
    DEFAULT_SESSIONS_SIDEBAR_SETTINGS,
  );
  const settings = parseSessionsSidebarSettings(raw);

  return {
    settings,
    setAppSortOrder: (appSortOrder: AppSortOrder) => {
      setRaw((prev) => ({
        ...parseSessionsSidebarSettings(prev),
        appSortOrder,
      }));
    },
    setSessionSortOrder: (sessionSortOrder: SessionSortOrder) => {
      setRaw((prev) => ({
        ...parseSessionsSidebarSettings(prev),
        sessionSortOrder,
      }));
    },
    setSessionPreviewCount: (sessionPreviewCount: number) => {
      setRaw((prev) => ({
        ...parseSessionsSidebarSettings(prev),
        sessionPreviewCount: clampSessionPreviewCount(sessionPreviewCount),
      }));
    },
    setLayout: (layout: SessionLayout) => {
      setRaw((prev) => ({ ...parseSessionsSidebarSettings(prev), layout }));
    },
    setOnlyMine: (onlyMine: boolean) => {
      setRaw((prev) => ({ ...parseSessionsSidebarSettings(prev), onlyMine }));
    },
  };
}
