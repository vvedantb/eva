import {
  checkTone,
  type PrCheck,
  type PrOverview,
  type StatusTone,
} from "./prOverviewMeta";

/**
 * Everything both review surfaces need to say about whether a pull request can
 * merge, derived in one place. The header states it compactly above the tabs, the
 * Checks tab states it at length, and the merge button's tooltip states why it is
 * disabled — three registers of one verdict, which is why none of them re-derives
 * it.
 */

export type CheckCounts = Record<StatusTone, number> & { total: number };

export function countChecks(checks: readonly PrCheck[]): CheckCounts {
  const counts: CheckCounts = {
    success: 0,
    failure: 0,
    pending: 0,
    neutral: 0,
    total: checks.length,
  };
  for (const check of checks) {
    counts[checkTone(check)] += 1;
  }
  return counts;
}

/**
 * The worst outcome wins: one failing check matters more than twenty passing
 * ones, and anything still running outranks a clean result that is not final.
 */
export function checksOverallTone(counts: CheckCounts): StatusTone {
  if (counts.failure > 0) return "failure";
  if (counts.pending > 0) return "pending";
  if (counts.success > 0) return "success";
  return "neutral";
}

/** The Checks tab's verdict line, which has room to break every outcome out. */
export function checksHeadline(counts: CheckCounts): string {
  if (counts.failure === 0 && counts.pending === 0 && counts.success > 0) {
    return "All checks have passed";
  }
  const parts = [
    counts.failure > 0 ? `${counts.failure} failing` : null,
    counts.pending > 0 ? `${counts.pending} in progress` : null,
    counts.success > 0 ? `${counts.success} passing` : null,
    counts.neutral > 0 ? `${counts.neutral} skipped` : null,
  ].filter((part) => part !== null);
  return parts.join(" · ");
}

/**
 * Work eva can do about a blocker itself. Conflicts and a stale branch are both
 * ordinary agent tasks on the head branch, so the header offers a session rather
 * than leaving the reader at a dead end with GitHub's verdict.
 */
export interface PrRemedy {
  /** Button wording — an imperative naming what the session will do. */
  action: string;
  sessionTitle: string;
  prompt: string;
}

type PrBlockerKind =
  | "draft"
  | "checking"
  | "conflicts"
  | "unmergeable"
  | "protected"
  | "behind";

export interface PrBlocker {
  /** Discriminant, so a caller can filter a case without matching on wording. */
  kind: PrBlockerKind;
  tone: StatusTone;
  /** Badge wording for the header, at GitHub's brevity. */
  label: string;
  /** The merge box's headline sentence. */
  headline: string;
  /** What the reader has to do about it, spelled out. */
  detail: string;
  remedy: PrRemedy | null;
}

/** Null when an open pull request has nothing standing in the way of merging. */
export function mergeBlocker(overview: PrOverview): PrBlocker | null {
  if (overview.status !== "open") return null;

  if (overview.draft) {
    return {
      kind: "draft",
      tone: "neutral",
      label: "Draft",
      headline: "This pull request is still a draft",
      detail: "Mark the pull request ready for review to merge.",
      remedy: null,
    };
  }

  if (overview.mergeable === null) {
    return {
      kind: "checking",
      tone: "pending",
      label: "Checking mergeability",
      headline: "Checking whether this can be merged",
      detail:
        "GitHub is still working out whether this can merge. Refresh in a moment.",
      remedy: null,
    };
  }

  if (overview.mergeable === false) {
    if (overview.mergeableState === "dirty") {
      return {
        kind: "conflicts",
        tone: "failure",
        label: "Merge conflicts",
        headline: "This branch has conflicts that must be resolved",
        detail: "There are conflicts with the base branch.",
        remedy: {
          action: "Resolve in a new session",
          sessionTitle: `Resolve conflicts on #${overview.number}`,
          prompt: `Rebase this branch onto \`${overview.baseRef}\` and resolve every merge conflict. Keep the intent of both sides where they disagree, run a typecheck, then push the branch.`,
        },
      };
    }
    return {
      kind: "unmergeable",
      tone: "failure",
      label: "Cannot merge",
      headline: "This branch cannot be merged yet",
      detail: `GitHub reports this branch as ${overview.mergeableState}.`,
      remedy: null,
    };
  }

  if (overview.mergeableState === "blocked") {
    return {
      kind: "protected",
      tone: "failure",
      label: "Merge blocked",
      headline: "Merging is blocked",
      detail:
        "Branch protection still has unmet requirements, so GitHub may reject the merge.",
      remedy: null,
    };
  }

  if (overview.mergeableState === "behind") {
    return {
      kind: "behind",
      tone: "pending",
      label: "Behind base",
      headline: "This branch is behind the base branch",
      detail:
        "The branch is behind the base branch and may need updating first.",
      remedy: {
        action: "Update in a new session",
        sessionTitle: `Update #${overview.number} from ${overview.baseRef}`,
        prompt: `Merge \`${overview.baseRef}\` into this branch to bring it up to date, run a typecheck, then push the branch.`,
      },
    };
  }

  return null;
}

/**
 * The blocker worth a badge of its own in the header, which is not every blocker
 * `mergeBlocker` reports.
 *
 * `draft` is already the lifecycle pill's job — saying "Draft" twice in one header
 * is noise, not emphasis. `checking` is GitHub's own bookkeeping, true for a second
 * or two after a push and nothing the reader can act on. What is left is exactly
 * the set that needs work doing, which is why the remedy button lives beside it.
 */
export function headerBlocker(overview: PrOverview): PrBlocker | null {
  const blocker = mergeBlocker(overview);
  if (blocker === null) return null;
  if (blocker.kind === "draft" || blocker.kind === "checking") return null;
  return blocker;
}
