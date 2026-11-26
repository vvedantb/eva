import {
  isEmptyActivityPayload,
  parseActivitySteps,
} from "@eva/shared/parseActivitySteps";
import type { ActivityStep } from "@vvedantb/ui";

const THINKING_HEARTBEAT_INTERVAL_SECONDS = 30;

function isHiddenThinkingStep(step: ActivityStep): boolean {
  return step.type === "reasoning" || step.type === "thinking";
}

const FIELD_SEP = "\u0001";
const STEP_SEP = "\u0000";

function fingerprintStep(step: ActivityStep): string {
  return [
    step.type,
    step.label,
    step.status,
    step.isError === true ? "!" : "",
    step.durationMs ?? "",
    step.detail?.length ?? "",
    step.command?.length ?? "",
    step.output?.text.length ?? "",
    step.edits?.length ?? "",
    step.files?.length ?? "",
    step.todos?.map((todo) => todo.status).join(",") ?? "",
    step.questions?.length ?? "",
    step.answers === undefined ? "" : Object.keys(step.answers).length,
  ].join(FIELD_SEP);
}

/**
 * Fingerprint of user-visible work in an activity payload. Reasoning and
 * legacy thinking rows are stripped so streamed thoughts do not reset the
 * silence clock.
 */
export function visibleActivityKey(activity: string | undefined): string {
  const steps = parseActivitySteps(activity);
  if (!steps) {
    if (!activity?.trim() || isEmptyActivityPayload(activity)) return "";
    return activity.trim();
  }
  let key = "";
  for (const step of steps) {
    if (isHiddenThinkingStep(step)) continue;
    key += fingerprintStep(step) + STEP_SEP;
  }
  return key;
}

/**
 * Seconds to print on the heartbeat, snapped to the 30s interval, or null
 * before the first beat. 45s of silence still reads as 30s so the line
 * reprints on the same cadence as a log, not a 1Hz timer.
 */
export function thinkingHeartbeatSeconds(
  secondsSinceLastOutput: number,
): number | null {
  if (secondsSinceLastOutput < THINKING_HEARTBEAT_INTERVAL_SECONDS) {
    return null;
  }
  return (
    Math.floor(secondsSinceLastOutput / THINKING_HEARTBEAT_INTERVAL_SECONDS) *
    THINKING_HEARTBEAT_INTERVAL_SECONDS
  );
}

export function thinkingHeartbeatLabel(seconds: number): string {
  return `Model is thinking... (${seconds}s since last output)`;
}

/** ms until the silent-stream notice should appear, or 0 if it already should. */
export function silentStreamDelayMs(
  startedAt: number | undefined,
  now: number,
  thresholdSeconds: number,
): number {
  const start = startedAt ?? now;
  return Math.max(0, thresholdSeconds * 1000 - (now - start));
}
