import type { ProgressStep } from "../types.js";

/** Per-field caps at capture time (chars unless noted). */
export const STEP_FIELD_CAPS = {
  command: 600,
  /** One-line bash `detail` shown on the step row (full text rides `command`). */
  commandDetail: 300,
  output: 1200,
  editSide: 1000,
  editsMax: 4,
  filesMax: 10,
  contentPreview: 1000,
  /** Reasoning prose per burst; head-capped so one turn's thinking cannot
   * dominate the payload. Prose rides `detail` (see applyReasoningSnapshot). */
  reasoning: 6000,
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

/**
 * Strips heavy detail fields oldest-first until JSON fits under the budget.
 * Labels/types/status always survive.
 */
export function enforceStepBudget(steps: ProgressStep[]): ProgressStep[] {
  let encoded = JSON.stringify(steps);
  if (encoded.length <= STEP_FIELD_CAPS.jsonBytes) {
    return steps;
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
