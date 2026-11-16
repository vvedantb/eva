import type { ComponentType } from "react";
import { isHitType, type HitType } from "@eva/shared/spotlight";
import {
  IconBox,
  IconChartBar,
  IconChecklist,
  IconFileCode,
  IconFileText,
  IconFlask,
  IconFolder,
  IconGitPullRequest,
  IconHome,
  IconInbox,
  IconLayoutKanban,
  IconPencil,
  IconRobot,
  IconSearch,
  IconSettings,
  IconTerminal2,
  IconUsers,
} from "@tabler/icons-react";

export {
  GROUP_LABEL,
  groupHits,
  type HitType,
  type SpotlightHit,
} from "@eva/shared/spotlight";

export type SpotlightIcon = ComponentType<{
  size?: number;
  className?: string;
}>;

const TYPE_ICON: Record<HitType, SpotlightIcon> = {
  page: IconFolder,
  repo: IconBox,
  team: IconUsers,
  project: IconLayoutKanban,
  task: IconChecklist,
  draft: IconPencil,
  session: IconTerminal2,
  pr: IconGitPullRequest,
  doc: IconFileText,
  automation: IconRobot,
  artifact: IconFileCode,
};

function iconForPageTitle(title: string): SpotlightIcon {
  switch (title) {
    case "Home":
      return IconHome;
    case "Inbox":
      return IconInbox;
    case "Sessions":
      return IconTerminal2;
    case "Projects":
      return IconLayoutKanban;
    case "Quick Tasks":
      return IconChecklist;
    case "Documents":
      return IconFileText;
    case "Testing Arena":
      return IconFlask;
    case "Stats":
      return IconChartBar;
    case "Settings":
      return IconSettings;
    case "Teams":
      return IconUsers;
    case "Artifacts":
      return IconFileCode;
    case "Automations":
      return IconRobot;
    default:
      return IconSearch;
  }
}

export function iconForHit(type: HitType, title: string): SpotlightIcon {
  return type === "page" ? iconForPageTitle(title) : TYPE_ICON[type];
}

/** Icon for a recent entry, which carries its type as a plain string. */
export function iconForRecent(type: string, title: string): SpotlightIcon {
  return isHitType(type) ? iconForHit(type, title) : IconSearch;
}
