const READINESS_HINTS = {
  target: "where the change goes",
  expected: "what should happen",
  current: "what is wrong today",
} as const;

export type ReadinessSignal = keyof typeof READINESS_HINTS;

export interface DraftReadiness {
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
