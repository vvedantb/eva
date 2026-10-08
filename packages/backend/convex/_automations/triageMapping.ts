/**
 * Pure mapping between Jev's answer shapes and a finding's triage verdict.
 *
 * Kept free of Convex imports so the node action stays a thin caller and every
 * edge — a score off the end of the scale, a choice naming a task that has
 * since gone — is testable without a deployment. The task id is a type
 * parameter for the same reason: nothing here inspects it, so a test can pass
 * a plain string where the call site passes an `Id<"agentTasks">`.
 */

/**
 * Score levels handed to Jev, lowest first. Their order defines the mapping
 * back onto {@link FINDING_SEVERITIES}, so the two arrays must stay aligned.
 */
export const SEVERITY_LEVELS = [
  "low: cosmetic, nit or style-only",
  "medium: real defect with limited impact or an easy workaround",
  "high: bug, data or security issue users will hit",
  "critical: data loss, security breach, outage or release blocker",
] as const;

export const FINDING_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** Jev can answer between levels (2.4) or, on a bad day, outside them. */
export function severityFromScore(score: number): FindingSeverity {
  const rounded = Math.round(score);
  const index = Math.min(Math.max(rounded, 0), FINDING_SEVERITIES.length - 1);
  return FINDING_SEVERITIES[index];
}

/** Choice option name for one candidate task. Numbers, not ids: shorter prompt. */
export function duplicateOptionKey(numId: number): string {
  return `task-${numId}`;
}

export interface DuplicateCandidate<TId> {
  _id: TId;
  numId?: number;
  title: string;
}

export interface DuplicateVerdict<TId> {
  duplicateOfTaskId?: TId;
  duplicateOfNumId?: number;
  duplicateProbability: number;
}

/**
 * Resolves Jev's chosen option back to a task. An unknown key (the option list
 * moved on, or Jev invented one) reads as "no duplicate" rather than throwing.
 */
export function duplicateFromChoice<TId>(
  choice: string,
  probabilities: Record<string, number>,
  tasks: ReadonlyArray<DuplicateCandidate<TId>>,
): DuplicateVerdict<TId> {
  if (choice === "none") return { duplicateProbability: 0 };
  const match = tasks.find(
    (task) =>
      task.numId !== undefined && duplicateOptionKey(task.numId) === choice,
  );
  if (!match || match.numId === undefined) return { duplicateProbability: 0 };
  return {
    duplicateOfTaskId: match._id,
    duplicateOfNumId: match.numId,
    duplicateProbability: probabilities[choice] ?? 0,
  };
}

/** One Jev call per finding, so a 200-finding audit does not bill like one. */
export const MAX_TRIAGED_FINDINGS = 40;

/** Findings evaluated concurrently; the rest wait their turn. */
export const TRIAGE_BATCH_SIZE = 5;

/** Candidates + the "none" option must stay under Jev's 255-option cap. */
export const MAX_DUPLICATE_CANDIDATES = 120;
