import {
  DEFAULT_ISSUE_LABEL,
  REPO_EVENT_LABELS,
  type AutomationTrigger,
} from "@eva/backend";

/** Pure trigger copy and defaults, shared by the settings forms and Hub cards. */

export const CRON_TRIGGER: AutomationTrigger = { kind: "cron" };

/** A row's trigger; rows from before event triggers run on their schedule. */
export function automationTriggerOf(automation: {
  trigger?: AutomationTrigger;
}): AutomationTrigger {
  return automation.trigger ?? CRON_TRIGGER;
}

/** "Runs when …" for an event trigger, or null for a schedule. */
export function describeTrigger(trigger: AutomationTrigger): string | null {
  if (trigger.kind === "cron") return null;
  const when = REPO_EVENT_LABELS[trigger.event];
  if (trigger.event !== "issue_labeled") return `Runs when ${when}`;
  return `Runs when an issue is labelled "${trigger.label ?? DEFAULT_ISSUE_LABEL}"`;
}

/** Event presets whose run creates a quick task rather than a chat message. */
export function createsTasks(trigger: AutomationTrigger): boolean {
  return (
    trigger.kind === "event" &&
    (trigger.event === "issue_labeled" || trigger.event === "production_alert")
  );
}

/** Sentence-cases an event label for the dropdown. */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
