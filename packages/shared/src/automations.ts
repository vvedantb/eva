import { DEFAULT_ISSUE_LABEL, REPO_EVENT_LABELS, type AutomationTrigger } from "@eva/backend";
import cronstrue from "cronstrue";

// Automations, web and phone: the trigger and schedule in words, and a run's
// status tone. A schedule is stored in UTC and read in the viewer's time zone.

export const CRON_TRIGGER: AutomationTrigger = { kind: "cron" };

/** A row's trigger; rows from before event triggers run on their schedule. */
export function automationTriggerOf(automation: { trigger?: AutomationTrigger }): AutomationTrigger {
  return automation.trigger ?? CRON_TRIGGER;
}

/** "Runs when …" for an event trigger, or null for a schedule. */
export function describeTrigger(trigger: AutomationTrigger): string | null {
  if (trigger.kind === "cron") return null;
  const when = REPO_EVENT_LABELS[trigger.event];
  if (trigger.event !== "issue_labeled") return `Runs when ${when}`;
  return `Runs when an issue is labelled "${trigger.label ?? DEFAULT_ISSUE_LABEL}"`;
}

function getOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/** Moves a cron's minute and hour by `offsetMin`; null when they are not plain numbers. */
function offsetCronHour(expression: string, offsetMin: number): string | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour, ...rest] = parts;
  if (min === undefined || hour === undefined) return null;
  const minNum = parseInt(min, 10);
  const hourNum = parseInt(hour, 10);
  if (isNaN(minNum) || isNaN(hourNum) || min !== String(minNum) || hour !== String(hourNum)) return null;
  const total = hourNum * 60 + minNum + offsetMin;
  const newHour = ((Math.floor(total / 60) % 24) + 24) % 24;
  const newMin = ((total % 60) + 60) % 60;
  return [String(newMin), String(newHour), ...rest].join(" ");
}

/** A local-time cron as the UTC cron the server stores. */
export function localCronToUtc(localExpr: string): string {
  return offsetCronHour(localExpr, -getOffsetMinutes()) ?? localExpr;
}

/** A stored UTC cron in the viewer's local time. */
export function utcCronToLocal(utcExpr: string): string {
  return offsetCronHour(utcExpr, getOffsetMinutes()) ?? utcExpr;
}

/** A stored UTC cron in words, in local time ("At 09:00 AM, only on Monday"). */
export function describeCron(utcExpression: string): { valid: true; text: string } | { valid: false; partial: boolean } {
  const parts = utcExpression.trim().split(/\s+/);
  if (parts.length < 5) return { valid: false, partial: true };
  try {
    return { valid: true, text: cronstrue.toString(utcCronToLocal(utcExpression), { use24HourTimeFormat: false }) };
  } catch {
    return { valid: false, partial: false };
  }
}

/** When an automation runs, in words: its event, else its schedule (or the raw cron when it cannot be read). */
export function automationWhenText(automation: { trigger?: AutomationTrigger; cronSchedule: string }): string {
  const event = describeTrigger(automationTriggerOf(automation));
  if (event) return event;
  const cron = describeCron(automation.cronSchedule);
  return cron.valid ? cron.text : automation.cronSchedule;
}

/** A run status's badge tone, as the web run row draws it. */
export function automationRunTone(status: string): "success" | "destructive" | "warning" | "secondary" {
  if (status === "success") return "success";
  if (status === "error") return "destructive";
  if (status === "running") return "warning";
  return "secondary";
}

/** A run that has not finished: it can be stopped, and its time is still counting. */
export function isAutomationRunActive(status: string): boolean {
  return status === "running" || status === "queued";
}
