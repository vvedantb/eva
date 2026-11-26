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
  // A project task's own Preview and Browser in the project panel.
  "task-preview",
  "task-browser",
  "prd",
  "designs",
  "artifacts",
  "documents",
]);

/** Shown only with the `workspaceTabs` experimental flag. */
const WORKSPACE_SANDBOX_TABS = new Set(["editor", "computer", "files"]);

type SandboxTabFlags = { simpleView: boolean; workspaceTabs: boolean };

/**
 * Sandbox tabs this user does not see: simple view keeps only Preview /
 * Browser / Plan / Designs / Artifacts / Documents, and Editor / Computer /
 * Files need the `workspaceTabs` flag. A hidden tab bounces to Preview.
 */
export function isHiddenSandboxTab(
  tab: string,
  flags: SandboxTabFlags | undefined,
): boolean {
  if (flags?.simpleView === true && !SIMPLE_VIEW_SANDBOX_TABS.has(tab)) {
    return true;
  }
  return flags?.workspaceTabs !== true && WORKSPACE_SANDBOX_TABS.has(tab);
}

/** `isHiddenSandboxTab` for the signed-in user (workspace tabs hidden while loading). */
export function useIsHiddenSandboxTab(): (tab: string) => boolean {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return (tab) => isHiddenSandboxTab(tab, flags);
}

const SIMPLE_VIEW_HIDDEN_GLOBAL_SETTINGS_HREFS = [
  "/settings/sandboxes",
  "/settings/sandbox-status",
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
