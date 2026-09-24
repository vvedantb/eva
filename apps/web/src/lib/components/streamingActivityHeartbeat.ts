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

/** Separators no step field can contain, so fields cannot alias into a key. */
const FIELD_SEP = "\u0001";
const STEP_SEP = "\u0000";

/**
 * One step's contribution to the fingerprint: only the scalars that move while
 * a tool runs, never the bodies. Serialising the steps themselves re-encoded
 * every captured command output and edit hunk — a payload capped at 600 KB —
 * on every streamed token, purely to answer "did anything change?". Lengths
 * stand in for the bodies: a body cannot change size without changing, and a
 * same-length rewrite only delays the clock reset until the next real change.
 */
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
