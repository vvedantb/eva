import type { Infer } from "convex/values";
import type {
  automationTriggerValidator,
  repoEventKindValidator,
} from "../_validators/tableFields";

/**
 * Event-trigger vocabulary shared with the web app. Kept apart from
 * `events.ts` so the client does not bundle the webhook parsers.
 */

export type RepoEventKind = Infer<typeof repoEventKindValidator>;
export type AutomationTrigger = Infer<typeof automationTriggerValidator>;

/** Label that fires an issue trigger when the install has not set its own. */
export const DEFAULT_ISSUE_LABEL = "eva";

/** Human copy for each event, finishing the sentence "Runs when…". */
export const REPO_EVENT_LABELS: Record<RepoEventKind, string> = {
  ci_failed: "CI fails on an Eva PR",
  pr_feedback: "someone reviews an Eva PR",
  issue_labeled: "an issue gets a label",
  pr_opened: "a PR is opened",
  pr_merged: "a PR is merged",
  pr_updated: "a commit is pushed to a PR",
  pr_opened_or_updated: "a PR is opened or a commit is pushed to it",
  production_alert: "an Axiom monitor alerts",
};

/** Events a user automation can pick; the PR-routing ones are presets only. */
export const USER_REPO_EVENTS: ReadonlyArray<RepoEventKind> = [
  "pr_opened",
  "pr_merged",
  "pr_updated",
  "pr_opened_or_updated",
  "issue_labeled",
];

/**
 * Only a scheduled automation can run by hand. An event automation's prompt
 * works on the PR or issue its event names, and a manual run has none.
 */
export function canRunByHand(trigger: AutomationTrigger | undefined): boolean {
  return trigger?.kind !== "event";
}
