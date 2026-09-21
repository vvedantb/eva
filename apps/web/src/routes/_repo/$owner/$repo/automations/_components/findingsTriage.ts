/**
 * Ordering and default selection for an automation run's findings.
 *
 * Findings arrive in whatever order the agent emitted them, each carrying the
 * agent's own severity and — once Jev has triaged the run — a `triage` verdict
 * that may disagree and may point at an open task already tracking the work.
 * The list ranks by the triaged severity and pre-selects the findings worth
 * acting on, so the common case is "glance, then click Create".
 *
 * Pure so the selection algebra is testable: the checkbox state is a default
 * set XOR a set of user overrides, which keeps a re-triage from silently
 * unticking a box the user ticked.
 */

import type { Doc } from "@eva/backend";

export type Finding = NonNullable<Doc<"automationRuns">["findings"]>[number];
export type FindingSeverity = Finding["severity"];

export const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/** Jev's severity when the run has been triaged, else the agent's own. */
export function effectiveSeverity(finding: Finding): FindingSeverity {
  return finding.triage?.severity ?? finding.severity;
}

/** Worst first. `toSorted` is stable, so equal severities keep agent order. */
export function sortFindings(findings: ReadonlyArray<Finding>): Array<Finding> {
  return findings.toSorted(
    (a, b) =>
      SEVERITY_RANK[effectiveSeverity(b)] - SEVERITY_RANK[effectiveSeverity(a)],
  );
}

/**
 * How sure Jev must be before the UI calls a finding a duplicate. High on
 * purpose: the cost of hiding real work is worse than one redundant task.
 */
export const DUPLICATE_HINT_THRESHOLD = 0.7;

export function isLikelyDuplicate(finding: Finding): boolean {
  const triage = finding.triage;
  if (!triage || triage.duplicateOfTaskId === undefined) return false;
  return triage.duplicateProbability >= DUPLICATE_HINT_THRESHOLD;
}

/**
 * The findings the list ticks on its own: severe, not already converted to a
 * task, and not a likely duplicate of open work.
 */
export function defaultSelectedIds(
  findings: ReadonlyArray<Finding>,
): Set<string> {
  const ids = new Set<string>();
  for (const finding of findings) {
    if (finding.taskId !== undefined) continue;
    if (isLikelyDuplicate(finding)) continue;
    const severity = effectiveSeverity(finding);
    if (severity === "high" || severity === "critical") ids.add(finding.id);
  }
  return ids;
}

/** A finding is ticked when the user has not overridden its default. */
export function isSelected(
  id: string,
  defaults: ReadonlySet<string>,
  overrides: ReadonlySet<string>,
): boolean {
  return defaults.has(id) !== overrides.has(id);
}

export function toggleOverride(
  overrides: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(overrides);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Overrides that tick everything selectable: the ids not already default. */
export function overridesForSelectAll(
  selectableIds: ReadonlyArray<string>,
  defaults: ReadonlySet<string>,
): Set<string> {
  return new Set(selectableIds.filter((id) => !defaults.has(id)));
}

/** Overrides that untick everything: the default ids, flipped off. */
export function overridesForClear(
  selectableIds: ReadonlyArray<string>,
  defaults: ReadonlySet<string>,
): Set<string> {
  return new Set(selectableIds.filter((id) => defaults.has(id)));
}
