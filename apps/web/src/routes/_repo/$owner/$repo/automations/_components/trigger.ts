import { triggerHasEvent, type AutomationTrigger } from "@eva/backend";

/** Pure trigger copy and defaults, shared by the settings forms and Hub cards. */

export {
  automationTriggerOf,
  CRON_TRIGGER,
  describeTrigger,
} from "@eva/shared/automations";

/** Event presets whose run creates a quick task rather than a chat message. */
export function createsTasks(trigger: AutomationTrigger): boolean {
  return (
    triggerHasEvent(trigger, "issue_labeled") ||
    triggerHasEvent(trigger, "production_alert")
  );
}

/** Sentence-cases an event label for the dropdown. */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
