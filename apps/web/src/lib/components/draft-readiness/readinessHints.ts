/**
 * Client half of the draft-readiness nudge: what to show, and when.
 *
 * The signal names mirror `convex/_agentTasks/readiness.ts`, but the wording
 * is defined here — the backend owns the rubric it asks Jev about, the client
 * owns the phrasing the user reads, and web cannot import convex source.
 */

/** Signal -> the short phrase the banner asks the user to add. */
export const READINESS_HINTS = {
  target: "where the change goes",
  expected: "what should happen",
  current: "what is wrong today",
} as const;

export type ReadinessSignal = keyof typeof READINESS_HINTS;

export interface DraftReadiness {
  /** 0 (too vague to start) to 1 (fully specified). */
  score: number;
  missing: ReadinessSignal[];
}

/** Only nudge on the bottom half of the scale; "clear enough" is left alone. */
export const READINESS_NUDGE_THRESHOLD = 0.5;

/**
 * Hint phrases for the missing signals, in the order given and without
 * repeats — a duplicated signal would otherwise read as "…, what should
 * happen, what should happen".
 */
export function readinessHints(
  missing: ReadonlyArray<ReadinessSignal>,
): string[] {
  const seen = new Set<ReadinessSignal>();
  const hints: string[] = [];
  for (const signal of missing) {
    if (seen.has(signal)) continue;
    seen.add(signal);
    hints.push(READINESS_HINTS[signal]);
  }
  return hints;
}

/** No result (not judged yet, or dismissed) means no banner. */
export function shouldNudge(result: { score: number } | null): boolean {
  return result !== null && result.score < READINESS_NUDGE_THRESHOLD;
}
