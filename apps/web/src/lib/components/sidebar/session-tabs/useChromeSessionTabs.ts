"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";

/** True when pathname is the global sessions landing or any repo sessions route. */
function isSessionsNavPath(pathname: string): boolean {
  if (pathname === "/sessions" || pathname === "/sessions/") return true;
  const parts = pathname.split("/").filter(Boolean);
  return parts.includes("sessions");
}

/** Convex opt-in for Chrome-style session tabs (false while loading). */
function useExperimentalSessionTabsEnabled(): boolean {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return flags?.sessionTabs === true;
}

/**
 * Whether the Chrome tab strip should replace the sessions sidebar for the
 * current path (flag on + on a sessions nav path).
 */
export function useChromeSessionTabsActive(pathname: string): boolean {
  const enabled = useExperimentalSessionTabsEnabled();
  return enabled && isSessionsNavPath(pathname);
}
