import type { ComponentType } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
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

export type SpotlightHit = FunctionReturnType<
  typeof api.spotlight.search
>[number];

export type HitType = SpotlightHit["type"];

export type SpotlightIcon = ComponentType<{
  size?: number;
  className?: string;
}>;

/** Render order of the result groups. Pull requests sit next to their work. */
const GROUP_ORDER: HitType[] = [
  "page",
  "repo",
  "team",
  "project",
  "task",
  "draft",
  "session",
  "pr",
  "doc",
  "automation",
  "artifact",
];

export const GROUP_LABEL: Record<HitType, string> = {
  page: "Pages",
  repo: "Repos",
  team: "Teams",
  project: "Projects",
  task: "Tasks",
  draft: "Drafts",
  session: "Sessions",
  pr: "Pull requests",
  doc: "Documents",
  automation: "Automations",
  artifact: "Artifacts",
};

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

/**
 * Whether a stored string is still a type this build knows. Recents outlive
 * deploys, so a saved entry can name a type that has since been renamed.
 */
function isHitType(value: string): value is HitType {
  return GROUP_ORDER.some((type) => type === value);
}

/** Icon for a recent entry, which carries its type as a plain string. */
export function iconForRecent(type: string, title: string): SpotlightIcon {
  return isHitType(type) ? iconForHit(type, title) : IconSearch;
}

export function groupHits(hits: SpotlightHit[]): Array<{
  type: HitType;
  items: SpotlightHit[];
}> {
  const buckets = new Map<HitType, SpotlightHit[]>();
  for (const hit of hits) {
    const existing = buckets.get(hit.type);
    if (existing) {
      existing.push(hit);
    } else {
      buckets.set(hit.type, [hit]);
    }
  }
  return GROUP_ORDER.flatMap((type) => {
    const items = buckets.get(type);
    if (!items || items.length === 0) return [];
    return [{ type, items }];
  });
}
