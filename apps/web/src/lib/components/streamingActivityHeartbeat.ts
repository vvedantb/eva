import {
  isEmptyActivityPayload,
  parseActivitySteps,
} from "@eva/shared/parseActivitySteps";
import type { ActivityStep } from "@eva/ui";

/** How often the simple-view thinking heartbeat reprints. */
export const THINKING_HEARTBEAT_INTERVAL_SECONDS = 30;

/**
 * Steps that simple view never surfaces. Updating only these is still
 * "no output" — the user cannot see reasoning tokens, so a long think
 * looks hung unless we heartbeat.
 */
function isHiddenThinkingStep(step: ActivityStep): boolean {
  return step.type === "reasoning" || step.type === "thinking";
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
  const visible = steps.filter((step) => !isHiddenThinkingStep(step));
  if (visible.length === 0) return "";
  return JSON.stringify(visible);
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
