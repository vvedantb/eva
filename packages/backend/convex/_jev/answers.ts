/**
 * Readers for a single answer out of an {@link EvaluateOutcome}.
 *
 * Jev's answer map is keyed by the ids the caller asked under, and a failed
 * outcome has no answers at all. Every reader returns `null` rather than
 * throwing for the three ways a read can come up empty — the call failed, the
 * id is absent, or the answer is a different question type — so feature code
 * can fall back instead of branching on the outcome first.
 */

import { z } from "zod";
import type { EvaluateAnswer, EvaluateOutcome } from "./schema";

function answerOf(outcome: EvaluateOutcome, id: string): EvaluateAnswer | null {
  if (!outcome.ok) return null;
  const answer: EvaluateAnswer | undefined = outcome.answers[id];
  return answer ?? null;
}

/** P(true) for a boolean question. */
export function readBoolean(
  outcome: EvaluateOutcome,
  id: string,
): number | null {
  const answer = answerOf(outcome, id);
  if (answer === null || answer.type !== "boolean") return null;
  return answer.probability;
}

/** The chosen option and, when Jev returned them, per-option probabilities. */
export function readChoice(
  outcome: EvaluateOutcome,
  id: string,
): { choice: string; probabilities: Record<string, number> } | null {
  const answer = answerOf(outcome, id);
  if (answer === null || answer.type !== "choice") return null;
  return { choice: answer.choice, probabilities: answer.probabilities ?? {} };
}

/** The position on the scale and, when Jev returned them, per-level probabilities. */
export function readScore(
  outcome: EvaluateOutcome,
  id: string,
): { score: number; probabilities: Record<string, number> } | null {
  const answer = answerOf(outcome, id);
  if (answer === null || answer.type !== "score") return null;
  return { score: answer.score, probabilities: answer.probabilities ?? {} };
}

/** Provider metadata is untyped JSON on the wire, so parse before reading it. */
const confidenceMetadata = z.object({
  typesafe: z.object({ confidence: z.record(z.string(), z.number()) }),
});

/** Jev's own confidence for a choice or score answer, when it reported one. */
export function readConfidence(
  outcome: EvaluateOutcome,
  id: string,
): number | null {
  if (!outcome.ok) return null;
  const parsed = confidenceMetadata.safeParse(outcome.metadata);
  if (!parsed.success) return null;
  const confidence: number | undefined = parsed.data.typesafe.confidence[id];
  return confidence ?? null;
}
