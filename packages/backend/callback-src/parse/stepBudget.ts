import type { ProgressStep } from "../types.js";

/** Per-field caps at capture time (chars unless noted). */
export const STEP_FIELD_CAPS = {
  command: 600,
  output: 1200,
  editSide: 1000,
  editsMax: 4,
  filesMax: 10,
  contentPreview: 1000,
  /** Reasoning prose per burst; head-capped so one turn's thinking cannot
   * dominate the payload. Prose rides `detail` (see applyReasoningSnapshot). */
  reasoning: 6000,
  /** Reply text the agent writes between tool runs, per run; head-capped. */
  response: 4000,
  /** Soft ceiling for the whole steps JSON payload (under Convex 1 MiB). */
  jsonBytes: 600 * 1024,
} as const;

/** Keeps the first `max` characters; sets truncated when clipped. */
export function headCap(
  text: string,
  max: number,
): { text: string; truncated: boolean } {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, max), truncated: true };
}

/** Keeps the LAST `max` characters (errors live at the end). */
export function tailCap(
  text: string,
  max: number,
): { text: string; truncated: boolean } {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  return { text: text.slice(text.length - max), truncated: true };
}

const HEAVY_FIELDS = ["output", "edits", "files", "contentPreview"] as const;

type HeavyField = (typeof HEAVY_FIELDS)[number];

function stripHeavyField(step: ProgressStep, field: HeavyField): boolean {
  if (field === "output" && step.output !== undefined) {
    delete step.output;
    return true;
  }
  if (field === "edits" && step.edits !== undefined) {
    delete step.edits;
    return true;
  }
  if (field === "files" && step.files !== undefined) {
    delete step.files;
    return true;
  }
  if (field === "contentPreview" && step.contentPreview !== undefined) {
    delete step.contentPreview;
    return true;
  }
  return false;
}

/** A subagent's own message: only its child thread view reads it. */
function isSubagentText(step: ProgressStep): boolean {
  return step.type === "response" && step.parentToolUseId !== undefined;
}

/**
 * Strips heavy detail fields oldest-first until JSON fits under the budget.
 * Subagent messages go first so they never crowd out the parent's own steps.
 * Labels/types/status always survive.
 */
export function enforceStepBudget(steps: ProgressStep[]): ProgressStep[] {
  let encoded = JSON.stringify(steps);
  if (encoded.length <= STEP_FIELD_CAPS.jsonBytes) {
    return steps;
  }

  for (const step of steps) {
    if (encoded.length <= STEP_FIELD_CAPS.jsonBytes) {
      return steps;
    }
    if (isSubagentText(step) && stripHeavyField(step, "output")) {
      encoded = JSON.stringify(steps);
    }
  }

  for (const field of HEAVY_FIELDS) {
    for (const step of steps) {
      if (encoded.length <= STEP_FIELD_CAPS.jsonBytes) {
        return steps;
      }
      if (stripHeavyField(step, field)) {
        encoded = JSON.stringify(steps);
      }
    }
  }

  return steps;
}

/** Budget-enforce then stringify — use for every activityLog / heartbeat payload. */
export function serializeSteps(steps: ProgressStep[]): string {
  return JSON.stringify(enforceStepBudget(steps));
}

/**
 * Serializes a finished turn's steps without the response rows its final
 * message already shows, so no words are printed twice. Codex can fall back
 * to the whole streamed buffer as its result, so every row is checked, not
 * only the trailing ones.
 */
export function serializeFinalSteps(
  steps: ProgressStep[],
  finalText: string,
): string {
  const final = finalText.trim();
  const kept = final
    ? steps.filter((step) => {
        // Only the agent's own text can echo the final message; subagent text
        // (`parentToolUseId`, prose in `output`) belongs to its child thread.
        if (step.type !== "response" || step.parentToolUseId !== undefined) {
          return true;
        }
        const detail = (step.detail ?? "").trim();
        return !final.includes(detail) && !detail.startsWith(final);
      })
    : steps;
  return serializeSteps(kept);
}
