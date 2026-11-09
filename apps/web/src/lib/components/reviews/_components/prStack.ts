import type { PrOverview, StatusTone } from "./prOverviewMeta";

/**
 * GitHub's native PR stacks, read from the overview. Merging entry N lands every
 * open entry from 1 to N together, so "can this merge" is a question about the
 * whole lower part of the stack, not only the pull request on screen.
 */

export type PrStack = NonNullable<PrOverview["stack"]>;
export type PrStackEntry = PrStack["entries"][number];

/** The open entries a merge of the current pull request lands, base first. */
export function stackMergeTargets(stack: PrStack): PrStackEntry[] {
  return stack.entries.filter(
    (entry) => entry.position <= stack.position && entry.status === "open",
  );
}

/**
 * Why a lower entry stops the merge, or null. The current pull request is left
 * to `mergeBlocker`'s own checks; this covers only what the reader cannot see
 * from this page.
 */
export function stackBlockingReason(stack: PrStack): string | null {
  for (const entry of stack.entries) {
    if (entry.position >= stack.position) break;
    if (entry.status === "closed") {
      return `#${entry.number} is closed without being merged.`;
    }
    if (entry.status !== "open") continue;
    if (entry.draft) return `#${entry.number} is still a draft.`;
    if (entry.mergeable === false) {
      return `#${entry.number} cannot be merged yet.`;
    }
  }
  return null;
}

export interface StackVerdict {
  tone: StatusTone;
  label: string;
}

/** The popover's headline: one sentence about the stack as a whole. */
export function stackVerdict(stack: PrStack): StackVerdict {
  const targets = stackMergeTargets(stack);
  if (targets.length === 0) {
    // This PR is merged, but entries above it may still be open.
    const openAbove = stack.entries.filter(
      (entry) => entry.status === "open",
    ).length;
    if (openAbove === 0) return { tone: "success", label: "Stack merged" };
    return {
      tone: "neutral",
      label: `Merged · ${openAbove} ${openAbove === 1 ? "PR" : "PRs"} above still open`,
    };
  }
  if (stackBlockingReason(stack) !== null) {
    return { tone: "failure", label: "Stack needs attention" };
  }
  // Branch protection (reviews, required checks) holds the merge on GitHub's
  // side, so the popover must not promise what the header says is blocked.
  if (targets.some((entry) => entry.mergeableState === "blocked")) {
    return { tone: "failure", label: "Merge blocked" };
  }
  if (targets.some((entry) => entry.mergeable === null)) {
    return { tone: "pending", label: "Merge status pending" };
  }
  if (targets.some((entry) => entry.mergeableState === "unstable")) {
    return { tone: "failure", label: "Mergeable with failing checks" };
  }
  return { tone: "success", label: "Ready to merge" };
}

/** "Merge" for one pull request, "Merge 3 PRs" when the stack lands more. */
export function mergeButtonLabel(overview: PrOverview): string {
  const count = overview.stack ? stackMergeTargets(overview.stack).length : 1;
  return count > 1 ? `Merge ${count} PRs` : "Merge";
}
