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
  showDocumentsTab?: boolean,
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
  const withDocuments = showDocumentsTab
    ? [...withArtifacts, "documents"]
    : withArtifacts;
  if (!customTabSlugs || customTabSlugs.length === 0) return withDocuments;
  return [...withDocuments, ...customTabSlugs];
}

/**
 * The tab one `step` away from `activeTab`, wrapping at both ends. An unknown
 * active tab counts as the first one.
 */
export function stepSandboxTab(
  tabs: ReadonlyArray<string>,
  activeTab: string,
  step: 1 | -1,
): string | undefined {
  if (tabs.length === 0) return undefined;
  const currentIndex = Math.max(tabs.indexOf(activeTab), 0);
  return tabs[(currentIndex + step + tabs.length) % tabs.length];
}

/**
 * Cycles the visible right-panel tabs: forward with `cycleSandboxTab`,
 * backward with `cycleSandboxTabBack`.
 */
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
  showDocumentsTab,
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
  showDocumentsTab?: boolean;
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
    showDocumentsTab,
  );

  const options = { enabled: enabled && cyclableTabs.length > 1 };
  const cycle = (e: KeyboardEvent, step: 1 | -1) => {
    const next = stepSandboxTab(cyclableTabs, activeTab, step);
    if (next === undefined) return;
    e.preventDefault();
    onTabChange(next);
  };

  useShortcut("cycleSandboxTab", (e) => cycle(e, 1), options);
  useShortcut("cycleSandboxTabBack", (e) => cycle(e, -1), options);
}
