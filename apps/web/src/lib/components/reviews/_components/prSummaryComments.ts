import { reviewStateMeta, type PrOverview } from "./prOverviewMeta";

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
export function isBotLogin(login: string | null): boolean {
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
