import type { Id } from "../_generated/dataModel";
import type { AutomationAction } from "../_automations/systemAutomations";

/** One automation an event matched, with just what selection needs. */
export interface EventMatch {
  automationId: Id<"automations">;
  systemKey: string | undefined;
  action: AutomationAction;
  repoId: Id<"githubRepos">;
  /** True for a monorepo's root row, or a plain single-app repo. */
  isRootRow: boolean;
}

/**
 * Keeps one install per preset across a monorepo's app rows. Each app can
 * install "Fix failing CI", but one failure must reach the chat once, not once
 * per app. The install on the chat's own app wins, then the root row.
 *
 * User automations (`run`) are separate automations and all fire. Selection
 * is deterministic, so every webhook for a PR picks the same install and that
 * install's history (dedupe, CI cap) stays consistent.
 */
export function pickOnePerPreset(
  matches: ReadonlyArray<EventMatch>,
  preferredRepoId: Id<"githubRepos"> | undefined,
): EventMatch[] {
  const rank = (match: EventMatch): number =>
    match.repoId === preferredRepoId ? 0 : match.isRootRow ? 1 : 2;
  const chosen = new Map<string, EventMatch>();
  for (const match of matches) {
    const group =
      match.action === "run" || match.systemKey === undefined
        ? `automation:${String(match.automationId)}`
        : `preset:${match.systemKey}`;
    const current = chosen.get(group);
    if (current === undefined || rank(match) < rank(current)) {
      chosen.set(group, match);
    }
  }
  return [...chosen.values()];
}
