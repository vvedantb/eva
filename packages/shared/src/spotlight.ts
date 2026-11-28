import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";

export type SpotlightHit = FunctionReturnType<typeof api.spotlight.search>[number];

export type HitType = SpotlightHit["type"];

const GROUP_ORDER: HitType[] = ["page", "repo", "team", "project", "task", "draft", "session", "pr", "doc", "automation", "artifact"];

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

/** The search field's placeholder. */
export const SPOTLIGHT_PLACEHOLDER = "Search across your teams and repos…";

/**
 * Whether a stored string is still a type this build knows. Recents outlive
 * deploys, so a saved entry can name a type that has since been renamed.
 */
export function isHitType(value: string): value is HitType {
  return GROUP_ORDER.some((type) => type === value);
}

/** The hits in their groups, in `GROUP_ORDER`, empty groups left out. */
export function groupHits<T extends { type: HitType }>(hits: readonly T[]): Array<{ type: HitType; items: T[] }> {
  const buckets = new Map<HitType, T[]>();
  for (const hit of hits) {
    const existing = buckets.get(hit.type);
    if (existing) existing.push(hit);
    else buckets.set(hit.type, [hit]);
  }
  return GROUP_ORDER.flatMap((type) => {
    const items = buckets.get(type);
    if (!items || items.length === 0) return [];
    return [{ type, items }];
  });
}
