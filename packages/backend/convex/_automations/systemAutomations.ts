import type { Doc } from "../_generated/dataModel";
import type { AutomationTrigger } from "../_automationEvents/events";
import {
  CI_AUTOFIX_PROMPT,
  ISSUE_TO_TASK_PROMPT,
  REVIEW_RESPONDER_PROMPT,
} from "./prompts/eventPresets";
import { ADD_TEST_COVERAGE_PROMPT } from "./prompts/addTestCoverage";
import { DAILY_STANDUP_PROMPT } from "./prompts/dailyStandup";
import { FIND_CRITICAL_BUGS_PROMPT } from "./prompts/findCriticalBugs";
import { GENERATE_DOCS_PROMPT } from "./prompts/generateDocs";
import { IMPROVE_CODE_STRUCTURE_PROMPT } from "./prompts/improveCodeStructure";
import { THERMO_NUCLEAR_CODE_REVIEW_PROMPT } from "./prompts/thermoNuclearCodeReview";

/**
 * A system automation shipped with eva. The definition lives in code, so
 * changing an entry here updates every repo that has it installed. The schedule
 * is the exception: it is seeded from the catalog at install time and is then
 * the user's to change, like any other automation.
 */
export interface SystemAutomationDefinition {
  /** Stable identifier stored on the install row as `systemKey`. */
  key: string;
  title: string;
  /**
   * One line for the Hub card, which line-clamps to two. Separate from the
   * prompt so prompts can open with instructions rather than a description.
   */
  blurb: string;
  /** Prompt the agent runs each time. */
  description: string;
  /**
   * Standard 5-field cron expression in UTC, seeded onto new installs. Empty
   * for event-triggered entries.
   */
  defaultCronSchedule: string;
  /** Cron or repo event. For an event, `label` is the only install-owned part. */
  trigger: AutomationTrigger;
  /**
   * What firing does: start an agent run, post the event into the chat that
   * owns the PR, or create a quick task (see `_automationEvents/flush.ts`).
   */
  action: AutomationAction;
  /** Report-only runs never push a branch or open a PR. */
  readOnly: boolean;
  /** Whether the run parses actionable findings that can become tasks. */
  actionsEnabled: boolean;
}

export type AutomationAction = "run" | "route_to_pr_chat" | "create_task";

const CRON: AutomationTrigger = { kind: "cron" };

/**
 * Stable key of the daily standup install. The Today page and its sidebar tab
 * key off this, so it must never change once installs exist.
 */
export const DAILY_STANDUP_KEY = "daily-standup";

/**
 * Default schedules stagger across the small hours rather than all landing on
 * 03:00: the code-touching entries each run a full agent session, and a repo
 * with several installed would otherwise start them all at once.
 */
export const SYSTEM_AUTOMATIONS: ReadonlyArray<SystemAutomationDefinition> = [
  {
    key: DAILY_STANDUP_KEY,
    title: "Daily standup",
    blurb:
      "A short, plain-language summary of what changed in this app since the last working day.",
    description: DAILY_STANDUP_PROMPT,
    defaultCronSchedule: "0 8 * * 1-5",
    readOnly: true,
    actionsEnabled: false,
    trigger: CRON,
    action: "run",
  },
  {
    key: "find-critical-bugs",
    title: "Find critical bugs",
    blurb:
      "Hunts recent commits for high-severity correctness bugs, and only fixes the ones it can prove.",
    description: FIND_CRITICAL_BUGS_PROMPT,
    defaultCronSchedule: "0 3 * * *",
    readOnly: false,
    actionsEnabled: false,
    trigger: CRON,
    action: "run",
  },
  {
    key: "add-test-coverage",
    title: "Add test coverage",
    blurb: "Adds tests where recently merged code left risky paths uncovered.",
    description: ADD_TEST_COVERAGE_PROMPT,
    defaultCronSchedule: "30 3 * * *",
    readOnly: false,
    actionsEnabled: false,
    trigger: CRON,
    action: "run",
  },
  {
    key: "generate-docs",
    title: "Generate docs",
    blurb:
      "Keeps technical documentation current for recently changed subsystems with weak coverage.",
    description: GENERATE_DOCS_PROMPT,
    defaultCronSchedule: "0 4 * * *",
    readOnly: false,
    actionsEnabled: false,
    trigger: CRON,
    action: "run",
  },
  {
    key: "improve-code-structure",
    title: "Improve code structure",
    blurb:
      "Moves duplicated operational logic behind a shared service layer, keeping domain rules in actions.",
    description: IMPROVE_CODE_STRUCTURE_PROMPT,
    defaultCronSchedule: "30 4 * * *",
    readOnly: false,
    actionsEnabled: false,
    trigger: CRON,
    action: "run",
  },
  {
    key: "thermo-nuclear-code-review",
    title: "Thermo-Nuclear Code Quality Review",
    blurb:
      "A demanding structural audit of the past week's commits that pushes for simplification, not polish.",
    description: THERMO_NUCLEAR_CODE_REVIEW_PROMPT,
    defaultCronSchedule: "0 5 * * *",
    readOnly: false,
    actionsEnabled: false,
    trigger: CRON,
    action: "run",
  },
  {
    key: "ci-autofix",
    title: "Fix failing CI",
    blurb:
      "When CI fails on a PR Eva opened, sends the failing logs back to that chat to fix.",
    description: CI_AUTOFIX_PROMPT,
    defaultCronSchedule: "",
    readOnly: false,
    actionsEnabled: false,
    trigger: { kind: "event", event: "ci_failed" },
    action: "route_to_pr_chat",
  },
  {
    key: "review-responder",
    title: "Address review comments",
    blurb:
      "When someone reviews a PR Eva opened, sends their comments back to that chat to address.",
    description: REVIEW_RESPONDER_PROMPT,
    defaultCronSchedule: "",
    readOnly: false,
    actionsEnabled: false,
    trigger: { kind: "event", event: "pr_feedback" },
    action: "route_to_pr_chat",
  },
  {
    key: "issue-to-task",
    title: "Issues to tasks",
    blurb:
      "When a GitHub issue gets the eva label, creates a quick task for it and starts it.",
    description: ISSUE_TO_TASK_PROMPT,
    defaultCronSchedule: "",
    readOnly: false,
    actionsEnabled: false,
    trigger: { kind: "event", event: "issue_labeled" },
    action: "create_task",
  },
];

/** Looks up a catalog entry; undefined once an entry is removed from the code. */
export function getSystemAutomation(
  key: string,
): SystemAutomationDefinition | undefined {
  return SYSTEM_AUTOMATIONS.find((entry) => entry.key === key);
}

/** The trigger a row runs on, catalog overlay included. */
export function automationTrigger(
  doc: Pick<Doc<"automations">, "systemKey" | "trigger">,
): AutomationTrigger {
  const entry =
    doc.systemKey === undefined ? undefined : getSystemAutomation(doc.systemKey);
  if (!entry) return doc.trigger ?? CRON;
  return overlayTrigger(entry.trigger, doc.trigger);
}

/**
 * The cron spec to register for a row, or null when nothing should be
 * scheduled (disabled, no schedule, or triggered by an event instead).
 */
export function automationCronspec(
  doc: Pick<
    Doc<"automations">,
    "enabled" | "cronSchedule" | "systemKey" | "trigger"
  >,
): string | null {
  if (!doc.enabled || !doc.cronSchedule) return null;
  return automationTrigger(doc).kind === "cron" ? doc.cronSchedule : null;
}

/** User automations can only `run`; the other actions are catalog presets. */
export function automationAction(doc: Doc<"automations">): AutomationAction {
  if (doc.systemKey === undefined) return "run";
  return getSystemAutomation(doc.systemKey)?.action ?? "run";
}

/**
 * Overlays the code-defined definition onto an install row. A read-only view:
 * the returned doc must never be written back. Non-system rows, and installs
 * whose key no longer exists in the catalog, pass through unchanged (the latter
 * keep their stored fallback title and stay non-runnable via an empty prompt).
 *
 * `cronSchedule` is deliberately not overlaid — it belongs to the install, as
 * does an event trigger's `label`.
 */
export function resolveAutomationDoc(
  doc: Doc<"automations">,
): Doc<"automations"> {
  if (doc.systemKey === undefined) return doc;
  const entry = getSystemAutomation(doc.systemKey);
  if (!entry) return doc;
  return {
    ...doc,
    title: entry.title,
    description: entry.description,
    readOnly: entry.readOnly,
    actionsEnabled: entry.actionsEnabled,
    trigger: overlayTrigger(entry.trigger, doc.trigger),
  };
}

function overlayTrigger(
  catalog: AutomationTrigger,
  stored: AutomationTrigger | undefined,
): AutomationTrigger {
  if (catalog.kind !== "event" || stored?.kind !== "event") return catalog;
  return stored.label === undefined
    ? catalog
    : { ...catalog, label: stored.label };
}
