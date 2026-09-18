"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";

/** Convex opt-in for the simplified UI (false while flags are loading). */
export function useSimpleView(): boolean {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return flags?.simpleView === true;
}

const SIMPLE_VIEW_SANDBOX_TABS = new Set([
  "preview",
  "browser",
  "prd",
  "designs",
  "artifacts",
  "documents",
]);

/** Anything outside Preview / Browser / Plan / Designs / Artifacts / Documents bounces to Preview. */
export function isSimpleViewHiddenSandboxTab(tab: string): boolean {
  return !SIMPLE_VIEW_SANDBOX_TABS.has(tab);
}

const SIMPLE_VIEW_HIDDEN_GLOBAL_SETTINGS_HREFS = [
  "/settings/sandboxes",
  "/settings/sync",
] as const;

/** Global Settings pages that simple view does not show (bounce to Theme). */
export function isSimpleViewHiddenGlobalSettingsPath(
  pathname: string,
): boolean {
  return SIMPLE_VIEW_HIDDEN_GLOBAL_SETTINGS_HREFS.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

const SIMPLE_VIEW_HIDDEN_TEAM_TABS = new Set(["codebases", "env"]);

/** Team detail tabs that simple view does not show (bounce to Activity). */
export function isSimpleViewHiddenTeamTab(tab: string): boolean {
  return SIMPLE_VIEW_HIDDEN_TEAM_TABS.has(tab);
}
