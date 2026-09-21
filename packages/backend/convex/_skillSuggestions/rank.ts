/**
 * Pure helpers for the skill-suggestion action: what Jev is allowed to see,
 * and how its per-option probabilities turn back into skill ids.
 *
 * Runtime-free so the `"use node"` action stays a thin wrapper and the ranking
 * rules can be tested without a gateway call.
 */

/** Draft text cap — Jev judges the request, it does not read a document. */
export const MAX_SUGGESTION_TEXT_CHARS = 4000;
/** Jev allows 255 choice options; a composer list past this is noise anyway. */
export const MAX_CANDIDATES = 150;
export const MAX_CANDIDATE_DESCRIPTION_CHARS = 200;
/** How many ranked skills the action returns; the UI shows fewer. */
export const MAX_SUGGESTIONS = 5;
/** The escape hatch option, so Jev can say no skill fits. */
export const NONE_OPTION = "none";

export interface SkillCandidate {
  id: string;
  label: string;
  description: string;
}

export interface RankedSuggestion {
  id: string;
  probability: number;
}

/**
 * The candidate list Jev is asked about: one entry per label, trimmed, with
 * the escape-hatch name reserved.
 *
 * A choice question is keyed by option name, so two candidates sharing a label
 * would collapse into one option and the winning probability could not be
 * mapped back to a single skill. First label wins, matching the composer's own
 * shadowing order (system, then repo, then harness).
 */
export function dedupeCandidates(
  candidates: ReadonlyArray<SkillCandidate>,
): SkillCandidate[] {
  const seen = new Set<string>();
  const out: SkillCandidate[] = [];
  for (const candidate of candidates) {
    if (out.length >= MAX_CANDIDATES) break;
    const label = candidate.label.trim();
    if (label.length === 0) continue;
    // Case-insensitively: a skill literally called "None" would otherwise
    // become a second option Jev cannot tell from the escape hatch.
    if (label.toLowerCase() === NONE_OPTION) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: candidate.id, label, description: candidate.description });
  }
  return out;
}

/**
 * Turns Jev's per-option probabilities back into skill ids, best first.
 * Options Jev invented, and the escape hatch, are dropped rather than ranked.
 */
export function rankSuggestions(
  probabilities: Record<string, number>,
  candidates: ReadonlyArray<{ id: string; label: string }>,
): RankedSuggestion[] {
  const idByLabel = new Map<string, string>();
  for (const candidate of candidates) {
    idByLabel.set(candidate.label.trim().toLowerCase(), candidate.id);
  }
  const ranked: RankedSuggestion[] = [];
  for (const [label, probability] of Object.entries(probabilities)) {
    const key = label.trim().toLowerCase();
    if (key === NONE_OPTION) continue;
    const id = idByLabel.get(key);
    if (id === undefined) continue;
    ranked.push({ id, probability });
  }
  ranked.sort((a, b) => b.probability - a.probability);
  return ranked.slice(0, MAX_SUGGESTIONS);
}
