import type { Doc } from "../_generated/dataModel";
import { ADD_TEST_COVERAGE_PROMPT } from "./prompts/addTestCoverage";
import { DAILY_STANDUP_PROMPT } from "./prompts/dailyStandup";
import { FIND_CRITICAL_BUGS_PROMPT } from "./prompts/findCriticalBugs";
import { GENERATE_DOCS_PROMPT } from "./prompts/generateDocs";
import { IMPROVE_CODE_STRUCTURE_PROMPT } from "./prompts/improveCodeStructure";
import { MEMORY_DREAMING_PROMPT } from "./prompts/memoryDreaming";
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
  /** Standard 5-field cron expression in UTC, seeded onto new installs. */
  defaultCronSchedule: string;
  /** Report-only runs never push a branch or open a PR. */
  readOnly: boolean;
  /** Whether the run parses actionable findings that can become tasks. */
  actionsEnabled: boolean;
}

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
  },
  {
    key: "add-test-coverage",
    title: "Add test coverage",
    blurb: "Adds tests where recently merged code left risky paths uncovered.",
    description: ADD_TEST_COVERAGE_PROMPT,
    defaultCronSchedule: "30 3 * * *",
    readOnly: false,
    actionsEnabled: false,
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
  },
  {
    key: "memory-dreaming",
    title: "Memory dreaming",
    blurb:
      "Weekly tidy of agent memory: merges duplicates, fixes stale notes, and strips sensitive data.",
    description: MEMORY_DREAMING_PROMPT,
    defaultCronSchedule: "30 5 * * 0",
    readOnly: false,
    actionsEnabled: false,
  },
];

/** Looks up a catalog entry; undefined once an entry is removed from the code. */
export function getSystemAutomation(
  key: string,
): SystemAutomationDefinition | undefined {
  return SYSTEM_AUTOMATIONS.find((entry) => entry.key === key);
}

/**
 * Overlays the code-defined definition onto an install row. A read-only view:
 * the returned doc must never be written back. Non-system rows, and installs
 * whose key no longer exists in the catalog, pass through unchanged (the latter
 * keep their stored fallback title and stay non-runnable via an empty prompt).
 *
 * `cronSchedule` is deliberately not overlaid — it belongs to the install.
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
  };
}
