import {
  IconClipboardList,
  IconCode,
  IconDeviceDesktop,
  IconFileText,
  IconFile,
  IconLayoutDashboard,
  IconPalette,
  IconRobot,
} from "@tabler/icons-react";
import type { Doc } from "@eva/backend";
import { slugifyAppTabName } from "@/lib/utils/appTabSlug";
import type { SandboxCommandTab } from "@/lib/components/sandbox/sandboxPaletteCommands";
import type { SandboxTabDescriptor } from "./SandboxTabTrigger";

interface BuildSandboxTabDescriptorsArgs {
  /** Always-visible base tabs, already filtered to the enabled set. */
  baseTabs: ReadonlyArray<SandboxCommandTab>;
  showBrowserActivity: boolean;
  showEditorTab: boolean;
  showComputerTab: boolean;
  showFilesTab: boolean;
  showAgentsTab: boolean;
  /** True while any sub-agent is running — pulses the Agents tab dot. */
  hasRunningAgents: boolean;
  showPrdTab: boolean;
  hasPrdContent: boolean;
  showDesignsTab: boolean;
  hasDesignsContent: boolean;
  showArtifactsTab: boolean;
  /** Artifacts in this chat; `undefined` while the query is still loading. */
  artifactCount: number | undefined;
  showDocumentsTab: boolean;
  /** Documents in this chat; `undefined` while the query is still loading. */
  documentCount: number | undefined;
  customTabs: ReadonlyArray<Doc<"appTabs">>;
}

/**
 * One ordered list for the whole strip. The bar used to hand-roll a
 * `TabsTrigger` per conditional tab — eight near-identical blocks that each had
 * to remember the icon size and the indicator dot. Order here is the strip's
 * order, and must stay in step with `SANDBOX_TAB_BAR_ORDER` in
 * `useCycleSandboxTabHotkey`.
 */
export function buildSandboxTabDescriptors({
  baseTabs,
  showBrowserActivity,
  showEditorTab,
  showComputerTab,
  showFilesTab,
  showAgentsTab,
  hasRunningAgents,
  showPrdTab,
  hasPrdContent,
  showDesignsTab,
  hasDesignsContent,
  showArtifactsTab,
  artifactCount,
  showDocumentsTab,
  documentCount,
  customTabs,
}: BuildSandboxTabDescriptorsArgs): SandboxTabDescriptor[] {
  const descriptors: SandboxTabDescriptor[] = baseTabs.map((tab) => {
    const live = tab.value === "browser" && showBrowserActivity;
    return {
      value: tab.value,
      label: tab.label,
      icon: { kind: "component", Icon: tab.icon },
      indicator: live ? "activity" : undefined,
      indicatorLabel: live ? "Agent is browsing" : undefined,
    };
  });

  if (showEditorTab) {
    descriptors.push({
      value: "editor",
      label: "Editor",
      icon: { kind: "component", Icon: IconCode },
    });
  }

  if (showComputerTab) {
    descriptors.push({
      value: "computer",
      label: "Computer",
      icon: { kind: "component", Icon: IconDeviceDesktop },
    });
  }

  if (showFilesTab) {
    descriptors.push({
      value: "files",
      label: "Files",
      icon: { kind: "component", Icon: IconFileText },
    });
  }

  if (showAgentsTab) {
    descriptors.push({
      value: "agents",
      label: "Agents",
      icon: { kind: "component", Icon: IconRobot },
      indicator: hasRunningAgents ? "activity" : undefined,
      indicatorLabel: hasRunningAgents ? "Agents running" : undefined,
    });
  }

  if (showPrdTab) {
    descriptors.push({
      value: "prd",
      label: "Plan",
      icon: { kind: "component", Icon: IconClipboardList },
      indicator: hasPrdContent ? "content" : undefined,
      indicatorLabel: hasPrdContent ? "Plan available" : undefined,
    });
  }

  if (showDesignsTab) {
    descriptors.push({
      value: "designs",
      label: "Designs",
      icon: { kind: "component", Icon: IconPalette },
      indicator: hasDesignsContent ? "content" : undefined,
      indicatorLabel: hasDesignsContent
        ? "Design variations available"
        : undefined,
    });
  }

  if (showArtifactsTab) {
    descriptors.push({
      value: "artifacts",
      label: "Artifacts",
      icon: { kind: "component", Icon: IconLayoutDashboard },
      count: artifactCount,
      indicatorLabel: artifactCount
        ? `${artifactCount} artifacts in this chat`
        : undefined,
    });
  }

  if (showDocumentsTab) {
    descriptors.push({
      value: "documents",
      label: "Documents",
      icon: { kind: "component", Icon: IconFile },
      count: documentCount,
      indicatorLabel: documentCount
        ? `${documentCount} documents in this chat`
        : undefined,
    });
  }

  for (const tab of customTabs) {
    descriptors.push({
      value: slugifyAppTabName(tab.name),
      label: tab.name,
      icon: { kind: "name", name: tab.icon },
    });
  }

  return descriptors;
}
