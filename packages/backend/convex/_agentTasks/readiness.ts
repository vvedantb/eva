/**
 * The rubric behind the quick-task "draft readiness" nudge, and the two pure
 * functions that turn Jev's raw answers into something the banner can render.
 *
 * Runtime-free on purpose: the `"use node"` action imports it, and so do the
 * tests, so neither pulls a Convex runtime into the other.
 */

/** Ordered lowest to highest; Jev answers with a position on this scale. */
export const READINESS_LEVELS = [
  "too vague to start",
  "needs one clarification before starting",
  "clear enough to start",
  "fully specified with acceptance criteria",
] as const;

/** The three things a description needs before an agent can start. */
export const READINESS_SIGNALS = ["target", "expected", "current"] as const;

export type ReadinessSignal = (typeof READINESS_SIGNALS)[number];

export const READINESS_SIGNAL_QUESTIONS: Record<ReadinessSignal, string> = {
  target:
    "Does the description say where the change goes — a page, feature, file, component or API?",
  expected: "Does it state the expected outcome or behaviour after the change?",
  current:
    "Does it say what is wrong or missing today, or why the change is needed?",
};

/** Below this probability a signal counts as absent rather than uncertain. */
export const MISSING_SIGNAL_THRESHOLD = 0.5;

/**
 * Maps a position on {@link READINESS_LEVELS} onto 0..1, so the client can
 * threshold on a number whose meaning does not shift when a level is added.
 * Out-of-range positions are clamped rather than trusted.
 */
export function readinessScore(levelIndex: number): number {
  const top = READINESS_LEVELS.length - 1;
  const clamped = Math.min(Math.max(levelIndex, 0), top);
  return clamped / top;
}

/**
 * The signals Jev judged absent, in {@link READINESS_SIGNALS} order so the
 * hint list reads the same way every time. A `null` probability means the
 * answer was missing or the wrong type — unknown, not absent, so it is skipped.
 */
export function missingSignals(
  probabilities: Record<ReadinessSignal, number | null>,
  threshold = MISSING_SIGNAL_THRESHOLD,
): ReadinessSignal[] {
  return READINESS_SIGNALS.filter((signal) => {
    const probability = probabilities[signal];
    return probability !== null && probability < threshold;
  });
}
