/**
 * Who a routed question goes to.
 *
 * A routed thread is a group thread: Eva asks the handful of people who can
 * actually settle the question rather than guessing at one. Jev judges each
 * teammate independently — one boolean per person, so the bar for "include
 * them" is a number in this file instead of a mood in the prompt — and a
 * keyword fallback covers the gateway being down or Jev picking nobody.
 *
 * Pure so every tunable and every decision can be tested without the gateway.
 * The prompt wording lives here too, beside the threshold it feeds, rather
 * than in the `"use node"` action that sends it.
 */

/** Jev judges each teammate independently; this is the bar to be included. */
export const PARTICIPANT_THRESHOLD = 0.6;

/**
 * Jev answers at most 32 questions per call, and a directory this big means
 * the question is too broad to route anyway.
 */
export const MAX_JUDGED_CANDIDATES = 12;

/** A question that reaches everyone reaches no one. */
export const MAX_PICKED = 3;

export interface CandidateProfile {
  name: string;
  role: string | null;
  headline: string;
  owns: string;
  askMeAbout: string;
}

/**
 * Question id for candidate `index`. Ids are [A-Za-z0-9_-]; a user id is not,
 * so the caller keeps its own array order as the link back to the person.
 */
export function candidateQuestionId(index: number): string {
  return `candidate_${index}`;
}

/**
 * The yes/no Jev answers about one teammate. Deliberately biased towards the
 * person who owns the decision: "could have an opinion" is true of most of a
 * team, and a question that reaches everyone is ignored by everyone.
 */
export function candidateInstructions(candidate: CandidateProfile): string {
  const role = candidate.role ? ` (${candidate.role})` : "";
  return [
    `Is ${candidate.name}${role} one of the right people to answer this question?`,
    `${candidate.name} describes themselves as: ${candidate.headline}`,
    `They own: ${candidate.owns}`,
    `They say to ask them about: ${candidate.askMeAbout}`,
    "Answer true only if the question falls inside what they own or decide.",
    "Answer false if they would merely have an opinion, or would have to ask someone else.",
  ].join("\n");
}

/**
 * Indices above the threshold, highest probability first, capped at
 * MAX_PICKED. A null probability (absent or wrong-typed answer) is treated as
 * no signal, so one unanswered question cannot drag in the whole directory.
 */
export function selectByProbability(
  probabilities: ReadonlyArray<number | null>,
): number[] {
  const scored: Array<{ index: number; probability: number }> = [];
  probabilities.forEach((probability, index) => {
    if (probability === null) return;
    if (probability < PARTICIPANT_THRESHOLD) return;
    scored.push({ index, probability });
  });
  // Stable sort: equally confident picks keep directory order rather than
  // shuffling between calls.
  scored.sort((a, b) => b.probability - a.probability);
  return scored.slice(0, MAX_PICKED).map((entry) => entry.index);
}

/**
 * Deterministic fallback used when Jev is unavailable or picks nobody: word
 * overlap between the question and what a person says they own.
 */
export function scoreOverlap(
  question: string,
  profile: { owns: string; askMeAbout: string; headline: string },
): number {
  const words = new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  );
  const hay = `${profile.owns} ${profile.askMeAbout} ${profile.headline}`
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  let score = 0;
  for (const word of hay) {
    if (word.length > 2 && words.has(word)) score += 1;
  }
  return score;
}

/**
 * Best-scoring candidate indices by keyword overlap, capped and zero-filtered.
 * Empty when nothing overlaps, so the caller can report "pick someone" rather
 * than pinging whoever happens to be first in the directory.
 */
export function selectByOverlap(
  question: string,
  candidates: ReadonlyArray<CandidateProfile>,
): number[] {
  const scored: Array<{ index: number; score: number }> = [];
  candidates.forEach((candidate, index) => {
    const score = scoreOverlap(question, candidate);
    if (score > 0) scored.push({ index, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_PICKED).map((entry) => entry.index);
}
