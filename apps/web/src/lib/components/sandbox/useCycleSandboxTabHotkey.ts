"use client";

import { useShortcut } from "@/lib/hotkeys/useShortcut";
import type { SandboxTab } from "@/lib/search-params";

/**
 * Tab order matches `SandboxTabBar`'s always-visible rail (Preview, Browser,
 * Review). Editor / Computer follow when the surface enables them.
 */
const SANDBOX_TAB_BAR_ORDER: SandboxTab[] = ["preview", "browser", "review"];

/**
 * Returns the Shift+Tab cycle order: enabled builtins, then Editor/Computer
 * when shown, then File Viewer / PRD if shown, then custom tab slugs.
 */
function getCyclableSandboxTabs(
  enabledTabs?: ReadonlyArray<SandboxTab>,
  showPrdTab?: boolean,
  showDesignsTab?: boolean,
  customTabSlugs?: ReadonlyArray<string>,
  showFilesTab?: boolean,
  showComputerTab?: boolean,
  showEditorTab?: boolean,
  showAgentsTab?: boolean,
  showArtifactsTab?: boolean,
): string[] {
  const tabs = enabledTabs
    ? SANDBOX_TAB_BAR_ORDER.filter((tab) => enabledTabs.includes(tab))
    : [...SANDBOX_TAB_BAR_ORDER];
  const withEditor = showEditorTab ? [...tabs, "editor"] : tabs;
  const withComputer = showComputerTab
    ? [...withEditor, "computer"]
    : withEditor;
  const withFiles = showFilesTab ? [...withComputer, "files"] : withComputer;
  const withAgents = showAgentsTab ? [...withFiles, "agents"] : withFiles;
  const withPrd = showPrdTab ? [...withAgents, "prd"] : withAgents;
  const withDesigns = showDesignsTab ? [...withPrd, "designs"] : withPrd;
  const withArtifacts = showArtifactsTab
    ? [...withDesigns, "artifacts"]
    : withDesigns;
  if (!customTabSlugs || customTabSlugs.length === 0) return withArtifacts;
  return [...withArtifacts, ...customTabSlugs];
}

/** Cycles the visible right-panel tabs with `cycleSandboxTab`. */
export function useCycleSandboxTabHotkey({
  activeTab,
  onTabChange,
  enabledTabs,
  showPrdTab,
  showDesignsTab,
  showFilesTab,
  customTabSlugs,
  showComputerTab,
  showEditorTab,
  showAgentsTab,
  showArtifactsTab,
  enabled = true,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  enabledTabs?: ReadonlyArray<SandboxTab>;
  showPrdTab?: boolean;
  showDesignsTab?: boolean;
  showFilesTab?: boolean;
  customTabSlugs?: ReadonlyArray<string>;
  showComputerTab?: boolean;
  showEditorTab?: boolean;
  showAgentsTab?: boolean;
  showArtifactsTab?: boolean;
  enabled?: boolean;
}) {
  const cyclableTabs = getCyclableSandboxTabs(
    enabledTabs,
    showPrdTab,
    showDesignsTab,
    customTabSlugs,
    showFilesTab,
    showComputerTab,
    showEditorTab,
    showAgentsTab,
    showArtifactsTab,
  );

  useShortcut(
    "cycleSandboxTab",
    (e) => {
      if (cyclableTabs.length === 0) return;
      e.preventDefault();
      const currentIndex = cyclableTabs.indexOf(activeTab);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (safeIndex + 1) % cyclableTabs.length;
      onTabChange(cyclableTabs[nextIndex]);
    },
    { enabled: enabled && cyclableTabs.length > 1 },
  );
}
