import type {
  PrComment,
  PrCommit,
  PrOverview,
  PrReviewEvent,
} from "./prOverviewMeta";

/** A standalone comment: an issue comment, or an inline comment with no review. */
interface TimelineCommentItem {
  readonly kind: "comment";
  readonly key: string;
  readonly at: number;
  readonly comment: PrComment;
}

/** A submitted review, with the inline comments it was submitted alongside. */
export interface TimelineReviewItem {
  readonly kind: "review";
  readonly key: string;
  readonly at: number;
  readonly review: PrReviewEvent;
  readonly comments: readonly PrComment[];
}

/**
 * A run of consecutive commits, grouped as GitHub groups a push: one eva pull
 * request can carry dozens of commits, and a row each would bury the discussion.
 */
interface TimelineCommitsItem {
  readonly kind: "commits";
  readonly key: string;
  readonly at: number;
  readonly commits: readonly PrCommit[];
}

export type TimelineItem =
  | TimelineCommentItem
  | TimelineReviewItem
  | TimelineCommitsItem;

/** One commit, before consecutive commits are grouped. Sorting unit only. */
interface TimelineCommitItem {
  readonly kind: "commit";
  readonly key: string;
  readonly at: number;
  readonly commit: PrCommit;
}

type SortableItem =
  | TimelineCommentItem
  | TimelineReviewItem
  | TimelineCommitItem;

/** Same shape as {@link TimelineCommitsItem}, but still open for appending. */
interface CommitsGroup {
  readonly kind: "commits";
  readonly key: string;
  readonly at: number;
  readonly commits: PrCommit[];
}

/**
 * Collapses each run of adjacent commits into a single item. Anything said in
 * between splits the run, so the conversation still reads in order.
 */
function groupConsecutiveCommits(
  items: readonly SortableItem[],
): TimelineItem[] {
  const grouped: (TimelineCommentItem | TimelineReviewItem | CommitsGroup)[] =
    [];

  for (const item of items) {
    if (item.kind !== "commit") {
      grouped.push(item);
      continue;
    }
    const previous = grouped[grouped.length - 1];
    if (previous !== undefined && previous.kind === "commits") {
      previous.commits.push(item.commit);
      continue;
    }
    grouped.push({
      kind: "commits",
      key: `commits-${item.commit.sha}`,
      at: item.at,
      commits: [item.commit],
    });
  }

  return grouped;
}

/**
 * Sort order within the same timestamp. GitHub reads pushes as happening before
 * whatever was said about them, and a review verdict before the comments that
 * are not part of it.
 */
const KIND_RANK: Record<SortableItem["kind"], number> = {
  commit: 0,
  review: 1,
  comment: 2,
};

function timestamp(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * A review comment belongs to a review only if that review is one we are
 * rendering. Comments left outside a review (single-comment replies) and
 * comments whose review fell outside the fetched page stand on their own.
 */
function bucketCommentsByReview(
  comments: readonly PrComment[],
  reviewIds: ReadonlySet<number>,
): {
  byReview: Map<number, PrComment[]>;
  standalone: PrComment[];
} {
  const byReview = new Map<number, PrComment[]>();
  const standalone: PrComment[] = [];

  for (const comment of comments) {
    const reviewId = comment.reviewId;
    if (
      reviewId === undefined ||
      reviewId === null ||
      !reviewIds.has(reviewId)
    ) {
      standalone.push(comment);
      continue;
    }
    const existing = byReview.get(reviewId);
    if (existing === undefined) byReview.set(reviewId, [comment]);
    else existing.push(comment);
  }

  return { byReview, standalone };
}

/**
 * Flattens the overview payload into GitHub's Conversation timeline: comments,
 * review verdicts (with their inline comments nested underneath), and commits,
 * oldest first.
 *
 * The pull request description is deliberately not an item — it is the opening
 * bubble, not an event, and rendering it in the stream would put it out of order
 * whenever the body was edited.
 */
export function buildPrTimeline(overview: PrOverview): TimelineItem[] {
  const reviewIds = new Set(overview.reviewEvents.map((review) => review.id));
  const { byReview, standalone } = bucketCommentsByReview(
    overview.comments,
    reviewIds,
  );

  const reviewItems = overview.reviewEvents.flatMap(
    (review): TimelineReviewItem[] => {
      const comments = byReview.get(review.id) ?? [];
      // GitHub hides the empty shell a reviewer leaves behind when they submit
      // inline comments with no summary, or click Comment with nothing to say.
      const isEmptyShell =
        review.state === "COMMENTED" &&
        review.body.trim().length === 0 &&
        comments.length === 0;
      if (isEmptyShell) return [];
      return [
        {
          kind: "review",
          key: `review-${review.id}`,
          // A review with no submitted timestamp is dated by the comments it
          // carries, so it still lands next to them rather than at the top.
          at:
            timestamp(review.submittedAt) ||
            Math.max(0, ...comments.map((c) => timestamp(c.createdAt))),
          review,
          comments,
        },
      ];
    },
  );

  const commentItems = standalone.map(
    (comment): TimelineCommentItem => ({
      kind: "comment",
      key: `comment-${comment.kind}-${comment.id}`,
      at: timestamp(comment.createdAt),
      comment,
    }),
  );

  const commitItems = overview.commits.map(
    (commit): TimelineCommitItem => ({
      kind: "commit",
      key: `commit-${commit.sha}`,
      at: timestamp(commit.committedAt),
      commit,
    }),
  );

  const sorted = [...commitItems, ...reviewItems, ...commentItems].sort(
    (a, b) => {
      if (a.at !== b.at) return a.at - b.at;
      const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
      if (rank !== 0) return rank;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    },
  );

  return groupConsecutiveCommits(sorted);
}
