"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import { ThumbsRating } from "./ThumbsRating";

const LABELS = { positive: "Good reply", negative: "Bad reply" };

/**
 * Thumbs up / down on one finished Eva turn. One rating per user per turn
 * (`feedback.rateTurn`), listed on /feedback.
 */
export function TurnFeedbackActions({
  messageId,
  sentiment,
  comment,
}: {
  messageId: string;
  sentiment?: FeedbackSentiment;
  comment?: string;
}) {
  const rateTurn = useMutation(api.feedback.rateTurn);
  return (
    <ThumbsRating
      onRate={(next, nextComment) =>
        rateTurn({
          messageId,
          sentiment: next,
          ...(nextComment !== undefined ? { comment: nextComment } : {}),
        })
      }
      sentiment={sentiment}
      comment={comment}
      labels={LABELS}
    />
  );
}
