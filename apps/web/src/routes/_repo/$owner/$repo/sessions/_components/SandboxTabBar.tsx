"use client";

import {
  IconWorld,
  IconWorldFilled,
  IconBrowser,
  IconGitPullRequest,
} from "@tabler/icons-react";
import type { Doc } from "@eva/backend";
import { isAgentBrowsingActive } from "@eva/shared";
import { useCycleSandboxTabHotkey } from "@/lib/components/sandbox/useCycleSandboxTabHotkey";
import { useSandboxViewHotkeys } from "@/lib/components/sandbox/useSandboxViewHotkeys";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { useShortcutBinding } from "@/lib/hotkeys/useShortcut";
import { slugifyAppTabName } from "@eva/shared/appTabSlug";
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
import { useSandboxRailLabels } from "@/lib/components/sandbox/useSandboxRailLabels";
import { cn } from "@eva/ui";
import {
  ListEnter,
  SidePanelTabs,
  useMediaQuery,
  type SidePanelTabLayout,
} from "@vvedantb/ui";
import {
  SandboxTabTrigger,
  type SandboxTabDescriptor,
} from "./SandboxTabTrigger";
import { buildSandboxTabDescriptors } from "./sandboxTabDescriptors";
import { SandboxTabBarTools } from "./SandboxTabBarTools";

const MAX_LABELLED_TABS = 6;

const allTabs: ReadonlyArray<SandboxCommandTab> = [
  {
    value: "preview",
    label: "Preview",
    icon: IconWorld,
    activeIcon: IconWorldFilled,
  },
  { value: "browser", label: "Browser", icon: IconBrowser },
  { value: "review", label: "Review", icon: IconGitPullRequest },
];

interface SandboxTabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNewPreview?: () => void;
  newPreviewDisabled?: boolean;
  showPrdTab?: boolean;
  hasPrdContent?: boolean;
  showDesignsTab?: boolean;
  hasDesignsContent?: boolean;
  showArtifactsTab?: boolean;
  artifactCount?: number;
  showDocumentsTab?: boolean;
  documentCount?: number;
  showFilesTab?: boolean;
  showAgentsTab?: boolean;
  hasRunningAgents?: boolean;
  enabledTabs?: ReadonlyArray<SandboxTab>;
  customTabs?: ReadonlyArray<Doc<"appTabs">>;
  leadingTabs?: ReadonlyArray<SandboxTabDescriptor>;
  agentBrowsingAt?: number;
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
  artifactCount,
  showDocumentsTab = true,
  documentCount,
  showFilesTab = false,
  showAgentsTab = false,
  hasRunningAgents = false,
  enabledTabs,
  customTabs,
  leadingTabs = [],
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
  const { showLabels, setShowLabels } = useSandboxRailLabels();
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

  const tabDescriptors = [
    ...leadingTabs,
    ...buildSandboxTabDescriptors({
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
    artifactCount,
    showDocumentsTab,
    documentCount,
      customTabs: visibleCustomTabs,
    }),
  ];
  // Desktop is icon-only unless the reader has asked for the labelled rail.
  const iconOnly = !isMobile && !showLabels;
  // Phone-only rule: the desktop rail decides its own labels above.
  const collapseLabels = isMobile && tabDescriptors.length > MAX_LABELLED_TABS;

  const tabLayout = (value: string): SidePanelTabLayout => {
    if (!isMobile) return iconOnly ? "icon" : "stacked";
    return collapseLabels && value !== resolvedTab ? "icon" : "row";
  };

  const hotkeyLabel = formatForDisplay(
    useShortcutBinding("toggleSandboxPanel"),
  );
  // Desktop only: the active tab shows and hides the card (there is no
  // separate toggle). The phone's pane switcher owns show and hide.
  const onActiveTabClick = isMobile ? undefined : onToggle;
  const activeTabHint = onActiveTabClick
    ? `${collapsed ? "Show" : "Hide"} panel (${hotkeyLabel})`
    : undefined;

  const expandIfCollapsed = () => {
    if (collapsed && onToggle) onToggle();
  };

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    expandIfCollapsed();
  };

  const handleNewPreview = onNewPreview
    ? () => {
        onNewPreview();
        expandIfCollapsed();
      }
    : undefined;

  useCycleSandboxTabHotkey({
    activeTab: resolvedTab,
    onTabChange: handleTabChange,
    enabledTabs,
    showPrdTab,
    showDesignsTab,
    showArtifactsTab,
    showDocumentsTab,
    showFilesTab: showFiles,
    showAgentsTab: showAgents,
    customTabSlugs,
    leadingTabSlugs: leadingTabs.map((tab) => tab.value),
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

  const toggleRailLabels = () => setShowLabels(!showLabels);

  const commands = buildSandboxPaletteCommands({
    activeTab: resolvedTab,
    tabs,
    showFilesTab: showFiles,
    showAgentsTab: showAgents,
    showPrdTab,
    showDesignsTab,
    showArtifactsTab,
    showDocumentsTab,
    showEditorItem,
    showDesktopItem,
    customTabs: visibleCustomTabs,
    consoleDock,
    terminalPanel,
    onTabChange: handleTabChange,
    onNewPreview: handleNewPreview,
    newPreviewDisabled,
    simpleView,
    showRailLabels: showLabels,
    onToggleRailLabels: toggleRailLabels,
  });

  return (
    <>
      <SidePanelTabs.Rail labelled={showLabels} className={className}>
        <SidePanelTabs.List
          value={resolvedTab}
          onValueChange={handleTabChange}
          labelled={showLabels}
        >
          {tabDescriptors.map((tab, index) => (
            <ListEnter
              key={tab.value}
              index={index}
              fast
              /* The stacked chip fills the rail, so its wrapper has to as
                 well — an `inline-flex` box is content-sized. */
              className={cn(
                "inline-flex",
                showLabels ? "md:w-full" : undefined,
              )}
            >
              <SandboxTabTrigger
                tab={tab}
                onReselect={onActiveTabClick}
                reselectHint={
                  tab.value === resolvedTab ? activeTabHint : undefined
                }
                layout={tabLayout(tab.value)}
              />
            </ListEnter>
          ))}
        </SidePanelTabs.List>
        {simpleView ? null : (
          <SandboxTabBarTools
            onNewPreview={handleNewPreview}
            newPreviewDisabled={newPreviewDisabled}
            terminalPanel={terminalPanel}
            showLabels={showLabels}
            onToggleLabels={toggleRailLabels}
          />
        )}
      </SidePanelTabs.Rail>
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
