"use client";

import {
  IconWorld,
  IconBrowser,
  IconGitPullRequest,
} from "@tabler/icons-react";
import type { Doc } from "@eva/backend";
import { useCycleSandboxTabHotkey } from "@/lib/components/sandbox/useCycleSandboxTabHotkey";
import { useSandboxViewHotkeys } from "@/lib/components/sandbox/useSandboxViewHotkeys";
import { SandboxPanelToggleButton } from "@/lib/components/sandbox/SandboxPanelToggleButton";
import { slugifyAppTabName } from "@/lib/utils/appTabSlug";
import type { SandboxTab } from "@/lib/search-params";
import type { SandboxFileListApi } from "@/lib/components/sandbox/useSandboxFileList";
import type { ConsoleDockApi } from "@/lib/components/sandbox/useConsoleDock";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";
import { SandboxQuickOpenDialogs } from "@/lib/components/sandbox/SandboxQuickOpenDialogs";
import {
  buildSandboxPaletteCommands,
  type SandboxCommandTab,
} from "@/lib/components/sandbox/sandboxPaletteCommands";
import {
  isSimpleViewHiddenSandboxTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn, Tabs, TabsList } from "@eva/ui";
import { SandboxTabTrigger } from "./SandboxTabTrigger";
import { buildSandboxTabDescriptors } from "./sandboxTabDescriptors";
import { SandboxTabBarTools } from "./SandboxTabBarTools";

/* Chips on the canvas, not folder tabs. Desktop becomes a vertical icon rail
   (`md:flex-col`); mobile keeps this horizontal strip. The pane is `bg-card`
   and the bar sits on `--background`, so the tone step separates them.
   `md:z-20` stacks the rail above the splitter's overlapping hit target so the
   collapse button still receives clicks when the panel is snapped to 44px. */
const TAB_BAR_CLASS =
  "flex shrink-0 items-center gap-1 px-1.5 py-1 md:relative md:z-20 md:h-full md:w-11 md:flex-col md:items-center md:overflow-hidden md:px-1 md:py-1.5";

/* `justify-start` matters: the primitive centres its list, and centred content
   that overflows spills past *both* edges while `scrollLeft` cannot go
   negative. Desktop is a column; the same sliding pill marks the active tab. */
const TAB_LIST_CLASS =
  "h-auto max-w-full justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0 shadow-none scrollbar-none max-sm:justify-start [&_.t-tabs-pill]:smooth-shadow-ring-xs md:max-w-none md:flex-col md:overflow-x-hidden md:overflow-y-auto";

/**
 * Past this many tabs the inactive mobile labels collapse to icon-only (label
 * moves to a tooltip). Desktop is always icon-only.
 */
const MAX_LABELLED_TABS = 6;

// Editor and Computer are appended by `buildSandboxTabDescriptors` when the
// surface enables them. Browser is first-class (sessions) for watching agent
// Chrome.
const allTabs: ReadonlyArray<SandboxCommandTab> = [
  { value: "preview", label: "Preview", icon: IconWorld },
  { value: "browser", label: "Browser", icon: IconBrowser },
  { value: "review", label: "Review", icon: IconGitPullRequest },
];

interface SandboxTabBarProps {
  /** Builtin tab id (SandboxTab) or a custom tab's name slug. */
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNewPreview: () => void;
  newPreviewDisabled?: boolean;
  showPrdTab?: boolean;
  /** When true, shows a content indicator on the Plan tab. */
  hasPrdContent?: boolean;
  showDesignsTab?: boolean;
  /** When true, shows a content indicator on the Designs tab. */
  hasDesignsContent?: boolean;
  /** Shows the Artifacts tab (session / task / project sandbox chats). */
  showArtifactsTab?: boolean;
  /** When true, shows a content indicator on the Artifacts tab. */
  hasArtifactsContent?: boolean;
  /** Shows the File Viewer tab (sessions only). */
  showFilesTab?: boolean;
  /** Shows the Agents tab (content-keyed: the entity has spawned sub-agents). */
  showAgentsTab?: boolean;
  /** True while any sub-agent is running — pulses the Agents tab dot. */
  hasRunningAgents?: boolean;
  /** Subset of base tabs to render. Defaults to all four. */
  enabledTabs?: ReadonlyArray<SandboxTab>;
  /** User-defined tabs for this app; expected pre-filtered to enabled ones. */
  customTabs?: ReadonlyArray<Doc<"appTabs">>;
  /** When set (and fresh), shows a pulse on the Browser tab. */
  agentBrowsingAt?: number;
  /** When false, view hotkeys are inert (inactive cached session shells). */
  hotkeysEnabled?: boolean;
  /**
   * Extra classes on the bar itself. Sessions pass the chat-header padding so
   * the two columns share a row height on mobile; desktop rail overrides it.
   */
  className?: string;
  fileList: SandboxFileListApi;
  consoleDock: ConsoleDockApi;
  terminalPanel: TerminalPanelApi;
  /** Desktop: content pane is hidden; the rail stays. Ignored below `md`. */
  collapsed?: boolean;
  onToggle?: () => void;
}

const AGENT_BROWSING_LOCK_TTL_MS = 30 * 60 * 1000;

function isAgentBrowsingActive(agentBrowsingAt: number | undefined): boolean {
  if (agentBrowsingAt === undefined) return false;
  return Date.now() - agentBrowsingAt < AGENT_BROWSING_LOCK_TTL_MS;
}

export function SandboxTabBar({
  activeTab,
  onTabChange,
  onNewPreview,
  newPreviewDisabled = false,
  showPrdTab = false,
  hasPrdContent = false,
  showDesignsTab = false,
  hasDesignsContent = false,
  showArtifactsTab = true,
  hasArtifactsContent = false,
  showFilesTab = false,
  showAgentsTab = false,
  hasRunningAgents = false,
  enabledTabs,
  customTabs,
  agentBrowsingAt,
  hotkeysEnabled = true,
  className,
  fileList,
  consoleDock,
  terminalPanel,
  collapsed = false,
  onToggle,
}: SandboxTabBarProps) {
  const simpleView = useSimpleView();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const tabs = enabledTabs
    ? allTabs.filter((tab) => enabledTabs.includes(tab.value))
    : allTabs.filter((tab) => tab.value !== "browser");
  const showDesktopItem =
    !simpleView && (!enabledTabs || enabledTabs.includes("computer"));
  const showEditorItem =
    !simpleView && (!enabledTabs || enabledTabs.includes("editor"));
  const resolvedTab =
    simpleView && isSimpleViewHiddenSandboxTab(activeTab)
      ? "preview"
      : activeTab;

  const showFiles = showFilesTab && !simpleView;
  const showAgents = showAgentsTab && !simpleView;
  const visibleCustomTabs = simpleView ? [] : (customTabs ?? []);
  const customTabSlugs = visibleCustomTabs.map((tab) =>
    slugifyAppTabName(tab.name),
  );

  const tabDescriptors = buildSandboxTabDescriptors({
    baseTabs: tabs,
    showBrowserActivity: isAgentBrowsingActive(agentBrowsingAt),
    showEditorTab: showEditorItem,
    showComputerTab: showDesktopItem,
    showFilesTab: showFiles,
    showAgentsTab: showAgents,
    hasRunningAgents,
    showPrdTab,
    hasPrdContent,
    showDesignsTab,
    hasDesignsContent,
    showArtifactsTab,
    hasArtifactsContent,
    customTabs: visibleCustomTabs,
  });
  const iconOnly = !isMobile;
  const collapseLabels = !iconOnly && tabDescriptors.length > MAX_LABELLED_TABS;

  const expandIfCollapsed = () => {
    if (collapsed && onToggle) onToggle();
  };

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    expandIfCollapsed();
  };

  const handleNewPreview = () => {
    onNewPreview();
    expandIfCollapsed();
  };

  useCycleSandboxTabHotkey({
    activeTab: resolvedTab,
    onTabChange: handleTabChange,
    enabledTabs,
    showPrdTab,
    showDesignsTab,
    showArtifactsTab,
    showFilesTab: showFiles,
    showAgentsTab: showAgents,
    customTabSlugs,
    showComputerTab: showDesktopItem,
    showEditorTab: showEditorItem,
    enabled: hotkeysEnabled,
  });

  useSandboxViewHotkeys({
    activeTab: resolvedTab,
    onTabChange: handleTabChange,
    showBrowserTab: tabs.some((tab) => tab.value === "browser"),
    enabled: hotkeysEnabled,
  });

  const commands = buildSandboxPaletteCommands({
    activeTab: resolvedTab,
    tabs,
    showFilesTab: showFiles,
    showAgentsTab: showAgents,
    showPrdTab,
    showDesignsTab,
    showArtifactsTab,
    showEditorItem,
    showDesktopItem,
    customTabs: visibleCustomTabs,
    consoleDock,
    terminalPanel,
    onTabChange: handleTabChange,
    onNewPreview: handleNewPreview,
    newPreviewDisabled,
    simpleView,
  });

  return (
    <>
      <div className={cn(TAB_BAR_CLASS, className)}>
        {onToggle ? (
          <div className="hidden md:flex">
            <SandboxPanelToggleButton
              collapsed={collapsed}
              onToggle={onToggle}
            />
          </div>
        ) : null}
        <Tabs
          className="min-w-0 flex-1 md:flex md:min-h-0 md:w-full md:flex-col"
          value={resolvedTab}
          onValueChange={handleTabChange}
        >
          <TabsList className={TAB_LIST_CLASS}>
            {tabDescriptors.map((tab) => (
              <SandboxTabTrigger
                key={tab.value}
                tab={tab}
                onReselect={
                  collapsed && tab.value === resolvedTab
                    ? expandIfCollapsed
                    : undefined
                }
                labelHidden={
                  iconOnly || (collapseLabels && tab.value !== resolvedTab)
                }
              />
            ))}
          </TabsList>
        </Tabs>
        {simpleView ? null : (
          <SandboxTabBarTools
            onNewPreview={handleNewPreview}
            newPreviewDisabled={newPreviewDisabled}
            terminalPanel={terminalPanel}
          />
        )}
      </div>
      <SandboxQuickOpenDialogs
        fileList={fileList}
        commands={commands}
        onShowFiles={() => handleTabChange("files")}
        hotkeysEnabled={hotkeysEnabled}
        filesEnabled={showFiles}
      />
    </>
  );
}
