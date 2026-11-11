import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";

/**
 * The pull request review surface as data: what both the web Reviews page and
 * the phone review screen say about a pull request, derived in one place so
 * the two cannot disagree on whether it can merge or how a verdict is named.
 * Convex is the single source of truth for the overview shape.
 */
export type PrOverview = FunctionReturnType<
  typeof api.github.getPullRequestOverview
>;
export type PrCheck = PrOverview["checks"][number];
export type PrStack = NonNullable<PrOverview["stack"]>;
export type PrStackEntry = PrStack["entries"][number];

export type StatusTone = "success" | "failure" | "pending" | "neutral";

/** The Reviews list filter, in the web segmented order. */
export const PR_LIST_STATES = ["open", "closed", "all"] as const;
export type PullRequestListState = (typeof PR_LIST_STATES)[number];

/** Maps a check run or commit status onto one of four visual tones. */
export function checkTone(check: PrCheck): StatusTone {
  if (check.status !== "completed") return "pending";
  if (check.conclusion === "success") return "success";
  if (
    check.conclusion === "failure" ||
    check.conclusion === "timed_out" ||
    check.conclusion === "cancelled" ||
    check.conclusion === "action_required"
  ) {
    return "failure";
  }
  return "neutral";
}

/**
 * Review states as GitHub words them, plus the tone that drives the icon.
 * "Commented" is deliberately neutral — it neither blocks nor unblocks.
 */
export function reviewStateMeta(state: string): {
  label: string;
  tone: StatusTone;
} {
  if (state === "APPROVED") return { label: "Approved", tone: "success" };
  if (state === "CHANGES_REQUESTED") {
    return { label: "Requested changes", tone: "failure" };
  }
  if (state === "DISMISSED") return { label: "Dismissed", tone: "neutral" };
  if (state === "PENDING") return { label: "Pending", tone: "pending" };
  return { label: "Commented", tone: "neutral" };
}

// ── Checks and merge state ──────────────────────────────────────────────────

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

/** The Checks section's verdict line, which has room to break every outcome out. */
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
  | "stack"
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

  // A lower entry that cannot land stops this one too: GitHub merges a stack
  // from the base upwards, all or nothing.
  const stackReason = overview.stack ? stackBlockingReason(overview.stack) : null;
  if (stackReason !== null) {
    return {
      kind: "stack",
      tone: "failure",
      label: "Stack blocked",
      headline: "A pull request lower in the stack is not ready",
      detail: stackReason,
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

/**
 * Whether the merge control is live: an open, non-draft pull request GitHub
 * has called mergeable, with nothing lower in its stack holding it back.
 */
export function canMergePr(overview: PrOverview): boolean {
  return (
    overview.status === "open" &&
    !overview.draft &&
    overview.mergeable === true &&
    mergeBlocker(overview)?.kind !== "stack"
  );
}

export type MergeMethod = "merge" | "squash" | "rebase";

/** The merge methods, default first, as the web merge dropdown lists them. */
export const MERGE_METHODS: ReadonlyArray<{ value: MergeMethod; label: string }> = [
  { value: "squash", label: "Squash and merge" },
  { value: "merge", label: "Create a merge commit" },
  { value: "rebase", label: "Rebase and merge" },
];

// ── Stacks ──────────────────────────────────────────────────────────────────
// GitHub's native PR stacks, read from the overview. Merging entry N lands every
// open entry from 1 to N together, so "can this merge" is a question about the
// whole lower part of the stack, not only the pull request on screen.

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

/** The stack popover's headline: one sentence about the stack as a whole. */
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

/**
 * The session a Revert starts on a merged pull request. GitHub has no "undo
 * this merge" call (a revert is a commit on the base branch), so the web and
 * the phone start a session on the base with the revert asked for, naming the
 * merge commit when GitHub reported one.
 */
export function revertSessionRequest(overview: PrOverview): {
  title: string;
  message: string;
  baseBranch: string;
} {
  const sha = overview.mergeCommitSha;
  return {
    title: `Revert #${overview.number}`,
    message:
      sha === null
        ? `Revert the changes pull request #${overview.number} ("${overview.title}") merged into \`${overview.baseRef}\`. Open a pull request with the revert.`
        : `Revert merge commit \`${sha}\` (pull request #${overview.number}, "${overview.title}") on \`${overview.baseRef}\`. Use \`git revert -m 1 ${sha}\` if it is a merge commit, resolve any conflicts, then open a pull request with the revert.`,
    baseBranch: overview.baseRef,
  };
}

// ── Reviews ─────────────────────────────────────────────────────────────────

/** Canonical GitHub PR URL for an owner/repo + PR number (the key a recap is stored under). */
export function githubPrUrl(owner: string, repoName: string, prNumber: number): string {
  return `https://github.com/${owner}/${repoName}/pull/${prNumber}`;
}

/** Parse a positive PR number from a GitHub pull URL, or undefined if absent/invalid. */
export function prNumberFromGithubUrl(prUrl: string): number | undefined {
  const match = /\/pull\/(\d+)(?:\/|$|\?|#)/.exec(prUrl);
  if (match === null) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

/** The verdicts a review can carry, in the web composer order. */
export const REVIEW_EVENT_OPTIONS: ReadonlyArray<{
  event: ReviewEvent;
  label: string;
  hint: string;
}> = [
  {
    event: "COMMENT",
    label: "Comment",
    hint: "Submit feedback without an explicit approval.",
  },
  {
    event: "APPROVE",
    label: "Approve",
    hint: "Submit feedback and approve merging.",
  },
  {
    event: "REQUEST_CHANGES",
    label: "Request changes",
    hint: "Submit feedback that must be addressed before merging.",
  },
];

/**
 * Whether a review can be sent. GitHub requires a summary on a
 * changes-requested review, and a plain comment review needs a summary or at
 * least one line comment; an approval may be empty.
 */
export function canSubmitReview(
  event: ReviewEvent,
  body: string,
  lineCommentCount: number,
): boolean {
  const hasBody = body.trim().length > 0;
  if (event === "REQUEST_CHANGES") return hasBody;
  return event === "APPROVE" || lineCommentCount > 0 || hasBody;
}

/**
 * How a submitted review is reported back, in one place. Keyed off the state
 * GitHub returns rather than the event that was sent, so a verdict GitHub
 * declined to record cannot be announced as though it had been.
 */
export function verdictSuccessTitle(state: string): string {
  if (state === "APPROVED") return "Pull request approved";
  if (state === "CHANGES_REQUESTED") return "Changes requested";
  return "Review posted";
}

// ── Summary comments ────────────────────────────────────────────────────────

/** One remark in Summary's comment list, whatever GitHub API it came from. */
export interface SummaryComment {
  readonly key: string;
  readonly authorLogin: string | null;
  readonly authorAvatarUrl: string | null;
  readonly action: string;
  /** Verdict word for a review summary ("Approved"); null for a plain remark. */
  readonly verdict: string | null;
  readonly at: string | null;
  readonly htmlUrl: string;
  readonly body: string;
  readonly path?: string;
  readonly line?: number | null;
  readonly isBot: boolean;
}

/**
 * GitHub marks apps with a `[bot]` suffix. Review bots are most of the volume on
 * an eva pull request, so Summary folds them into one group below the people.
 */
function isBotLogin(login: string | null): boolean {
  return login !== null && login.endsWith("[bot]");
}

function timestamp(value: string | null): number {
  if (value === null) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Every remark on the pull request — conversation comments, inline review
 * comments, and review summaries that say something — oldest first. An empty
 * review shell (inline comments with no summary) says nothing on its own, so it
 * is left out; its inline comments are already here.
 */
export function buildSummaryComments(overview: PrOverview): SummaryComment[] {
  const comments = overview.comments.map(
    (comment): SummaryComment => ({
      key: `comment-${comment.kind}-${comment.id}`,
      authorLogin: comment.authorLogin,
      authorAvatarUrl: comment.authorAvatarUrl,
      action: comment.path ? "commented on" : "commented",
      verdict: null,
      at: comment.createdAt,
      htmlUrl: comment.htmlUrl,
      body: comment.body,
      path: comment.path,
      line: comment.line,
      isBot: isBotLogin(comment.authorLogin),
    }),
  );
  const reviews = overview.reviewEvents.flatMap((review): SummaryComment[] =>
    review.body.trim().length === 0
      ? []
      : [
          {
            key: `review-${review.id}`,
            authorLogin: review.authorLogin,
            authorAvatarUrl: review.authorAvatarUrl,
            action: "reviewed",
            verdict:
              review.state === "COMMENTED"
                ? null
                : reviewStateMeta(review.state).label,
            at: review.submittedAt,
            htmlUrl: review.htmlUrl,
            body: review.body,
            isBot: isBotLogin(review.authorLogin),
          },
        ],
  );
  return [...comments, ...reviews].sort(
    (a, b) => timestamp(a.at) - timestamp(b.at) || (a.key < b.key ? -1 : 1),
  );
}

/**
 * Summary's comment order on both apps: people first, then bots folded into
 * their own group, each in the reader's chosen order.
 */
export function splitSummaryComments(
  all: readonly SummaryComment[],
  order: "newest" | "oldest",
): { people: SummaryComment[]; bots: SummaryComment[] } {
  const ordered = order === "newest" ? [...all].reverse() : [...all];
  return {
    people: ordered.filter((comment) => !comment.isBot),
    bots: ordered.filter((comment) => comment.isBot),
  };
}

/** The reviewers row: each submitted review's author, then everyone still asked. */
export function prReviewers(overview: PrOverview): Array<{
  login: string;
  avatarUrl: string | null;
  /** A review state, or `REQUESTED` for a reviewer who has not answered. */
  state: string;
}> {
  return [
    ...overview.reviews.map((review) => ({
      login: review.authorLogin,
      avatarUrl: review.authorAvatarUrl,
      state: review.state,
    })),
    ...overview.requestedReviewers.map((reviewer) => ({
      login: reviewer.login,
      avatarUrl: reviewer.avatarUrl,
      state: "REQUESTED",
    })),
  ];
}
