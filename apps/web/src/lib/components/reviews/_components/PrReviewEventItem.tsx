"use client";

import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { PrCommentBubble } from "./PrCommentBubble";
import { reviewStateMeta } from "./prOverviewMeta";
import type { TimelineReviewItem } from "./prTimelineItems";

/** Sentence form of a verdict, so the timeline reads as prose. */
function verdictAction(state: string): string {
  if (state === "APPROVED") return "approved these changes";
  if (state === "CHANGES_REQUESTED") return "requested changes";
  if (state === "DISMISSED") return "had a review dismissed";
  return "reviewed these changes";
}

/**
 * A submitted review: the verdict as a one-line event, the reviewer's summary
 * (when they wrote one), and the inline comments submitted with it nested
 * underneath — which is what makes a bot's twelve file comments read as one
 * review rather than twelve separate voices.
 */
export function PrReviewEventItem({ item }: { item: TimelineReviewItem }) {
  const { review, comments } = item;
  const { label } = reviewStateMeta(review.state);

  return (
    <div className="min-w-0 space-y-2">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 text-sm text-muted-foreground">
        <a
          href={review.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground hover:underline"
        >
          {review.authorLogin}
        </a>
        <span>{verdictAction(review.state)}</span>
        {review.submittedAt ? (
          <span className="text-muted-foreground">
            <RelativeDateTime at={new Date(review.submittedAt).getTime()} />
          </span>
        ) : null}
        <span className="sr-only">{label}</span>
      </p>

      {review.body.trim().length > 0 ? (
        <PrCommentBubble
          authorLogin={review.authorLogin}
          action="left a review"
          at={review.submittedAt}
          htmlUrl={review.htmlUrl}
          body={review.body}
          // The verdict line above already says who, when, and links out;
          // repeating it read "vvedantb approved… / vvedantb left a review".
          byline={false}
        />
      ) : null}

      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li key={comment.id}>
              <PrCommentBubble
                authorLogin={comment.authorLogin}
                action="commented on"
                at={comment.createdAt}
                htmlUrl={comment.htmlUrl}
                body={comment.body}
                path={comment.path}
                line={comment.line}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
