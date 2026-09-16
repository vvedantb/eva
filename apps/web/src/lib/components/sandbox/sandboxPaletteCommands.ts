import type { ComponentType } from "react";
import type { Doc } from "@eva/backend";
import {
  IconApps,
  IconClipboardList,
  IconCode,
  IconDeviceDesktop,
  IconFile,
  IconFileText,
  IconLayoutDashboard,
  IconLetterCase,
  IconPalette,
  IconRobot,
  IconTerminal2,
  IconWorld,
} from "@tabler/icons-react";
import type { SandboxTab } from "@/lib/search-params";
import { slugifyAppTabName } from "@/lib/utils/appTabSlug";
import type { ConsoleDockApi } from "./useConsoleDock";
import type { TerminalPanelApi } from "./SandboxWorkspace";
import type { SandboxPaletteCommand } from "./SandboxQuickOpenDialogs";

export interface SandboxCommandTab {
  value: SandboxTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface BuildSandboxPaletteCommandsArgs {
  activeTab: string;
  tabs: ReadonlyArray<SandboxCommandTab>;
  showFilesTab: boolean;
  showAgentsTab: boolean;
  showPrdTab: boolean;
  showDesignsTab: boolean;
  showArtifactsTab: boolean;
  showDocumentsTab: boolean;
  showEditorItem: boolean;
  showDesktopItem: boolean;
  customTabs: ReadonlyArray<Doc<"appTabs">>;
  consoleDock: ConsoleDockApi;
  terminalPanel: TerminalPanelApi;
  onTabChange: (tab: string) => void;
  onNewPreview: () => void;
  newPreviewDisabled: boolean;
  simpleView?: boolean;
  /** Desktop rail: tab labels under the icons. */
  showRailLabels: boolean;
  onToggleRailLabels: () => void;
}

/** Builds the shared, context-aware command palette vocabulary. */
export function buildSandboxPaletteCommands({
  activeTab,
  tabs,
  showFilesTab,
  showAgentsTab,
  showPrdTab,
  showDesignsTab,
  showArtifactsTab,
  showDocumentsTab,
  showEditorItem,
  showDesktopItem,
  customTabs,
  consoleDock,
  terminalPanel,
  onTabChange,
  onNewPreview,
  newPreviewDisabled,
  simpleView = false,
  showRailLabels,
  onToggleRailLabels,
}: BuildSandboxPaletteCommandsArgs): SandboxPaletteCommand[] {
  const commands: SandboxPaletteCommand[] = tabs.map((tab) => ({
    id: `show-${tab.value}`,
    label: `Show ${tab.label}`,
    keywords: `view tab navigate ${tab.value}`,
    icon: tab.icon,
    run: () => onTabChange(tab.value),
  }));

  if (showFilesTab) {
    commands.push({
      id: "show-files",
      label: "Show Files",
      keywords: "view tab tree repository",
      icon: IconFileText,
      run: () => onTabChange("files"),
    });
  }
  if (showAgentsTab) {
    commands.push({
      id: "show-agents",
      label: "Show Agents",
      keywords: "view tab subagents background transcripts",
      icon: IconRobot,
      run: () => onTabChange("agents"),
    });
  }
  if (showPrdTab) {
    commands.push({
      id: "show-plan",
      label: "Show Plan",
      keywords: "view tab prd",
      icon: IconClipboardList,
      run: () => onTabChange("prd"),
    });
  }
  if (showDesignsTab) {
    commands.push({
      id: "show-designs",
      label: "Show Designs",
      keywords: "view tab variations",
      icon: IconPalette,
      run: () => onTabChange("designs"),
    });
  }
  if (showArtifactsTab) {
    commands.push({
      id: "show-artifacts",
      label: "Show Artifacts",
      keywords: "view tab dashboard hosted",
      icon: IconLayoutDashboard,
      run: () => onTabChange("artifacts"),
    });
  }
  if (showDocumentsTab) {
    commands.push({
      id: "show-documents",
      label: "Show Documents",
      keywords: "view tab prd docs design",
      icon: IconFile,
      run: () => onTabChange("documents"),
    });
  }
  if (showEditorItem) {
    commands.push({
      id: "show-editor",
      label: "Show Editor",
      keywords: "view tab code vscode",
      icon: IconCode,
      run: () => onTabChange("editor"),
    });
  }
  if (showDesktopItem) {
    commands.push({
      id: "show-computer",
      label: "Show Computer",
      keywords: "view tab desktop",
      icon: IconDeviceDesktop,
      run: () => onTabChange("computer"),
    });
  }
  for (const tab of customTabs) {
    commands.push({
      id: `show-custom-${tab._id}`,
      label: `Show ${tab.name}`,
      keywords: "view custom app tab",
      icon: IconApps,
      run: () => onTabChange(slugifyAppTabName(tab.name)),
    });
  }

  // Outside the `simpleView` gate: the rail is there either way, and this is
  // how a reader who cannot place the icons finds out the labels exist.
  commands.push({
    id: "toggle-rail-labels",
    label: showRailLabels ? "Hide tab labels" : "Show tab labels",
    keywords: "sandbox rail sidebar icon text names wide",
    icon: IconLetterCase,
    run: onToggleRailLabels,
  });

  if (!simpleView) {
    commands.push({
      id: "new-preview",
      label: "New Preview",
      keywords: "create add browser port",
      icon: IconWorld,
      run: onNewPreview,
      disabled: newPreviewDisabled,
    });
    commands.push(
      {
        id: "toggle-console",
        label: "Toggle Preview Console",
        keywords: "show hide logs dev server",
        icon: IconTerminal2,
        run: () => {
          if (activeTab !== "preview") {
            onTabChange("preview");
            consoleDock.expand();
            return;
          }
          consoleDock.toggle();
        },
      },
      {
        id: "toggle-terminal-panel",
        label: "Toggle Terminal Panel",
        keywords: "show hide shell pty bottom terminal",
        icon: IconTerminal2,
        run: terminalPanel.toggle,
      },
      {
        id: "new-terminal",
        label: "New Terminal",
        keywords: "create add shell pty console",
        icon: IconTerminal2,
        run: terminalPanel.newTerminal,
        disabled: terminalPanel.newTerminalDisabled,
      },
    );
  }

  return commands;
}
