"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  cn,
  toast,
} from "@eva/ui";
import { IconCheck, IconMessage, IconX } from "@tabler/icons-react";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { verdictSuccessTitle } from "@/lib/components/reviews/_components/prVerdict";
import { convexErrorMessage } from "@/lib/utils/convexErrorMessage";

type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

const EVENT_OPTIONS: ReadonlyArray<{
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
 * GitHub's "Review changes" control: posts the pending inline comments plus an
 * overall summary as one pull request review. Reviews are posted as the eva
 * GitHub App, so GitHub will refuse to approve a PR the app itself opened — its
 * rejection message is shown verbatim rather than pre-empted here.
 */
export function SubmitReviewPopover({
  repoId,
  prNumber,
}: {
  repoId: Id<"githubRepos">;
  prNumber: number;
}) {
  const review = usePendingReviewComments();
  const submitPrReview = useAction(api.github.submitPrReview);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!review) return null;

  // Only comments made against this diff carry a GitHub anchor; ones parsed out
  // of an agent message have diff-relative indices GitHub cannot place.
  const comments = review.comments.flatMap((comment) =>
    comment.anchor === null
      ? []
      : [
          {
            path: comment.filePath,
            body: comment.text,
            line: comment.anchor.line,
            side: comment.anchor.side,
            startLine: comment.anchor.startLine,
            startSide: comment.anchor.startSide,
          },
        ],
  );
  const unanchoredCount = review.comments.length - comments.length;

  const submit = () => {
    setIsSubmitting(true);
    setError(null);
    submitPrReview({ repoId, prNumber, event, body, comments })
      .then((res) => {
        review.clear();
        setBody("");
        setOpen(false);
        toast.success(verdictSuccessTitle(res.state), {
          description:
            comments.length > 0
              ? `${comments.length} inline comment${comments.length === 1 ? "" : "s"} posted to GitHub.`
              : "Posted to GitHub.",
        });
      })
      .catch((cause: unknown) => {
        setError(convexErrorMessage(cause, "GitHub rejected the review."));
      })
      .finally(() => setIsSubmitting(false));
  };

  const hasContent = comments.length > 0 || body.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <IconMessage className="size-3.5" />
          Review changes
          {review.comments.length > 0 ? (
            <span className="ml-0.5 rounded bg-primary px-1.5 text-[10px] font-medium tabular-nums text-primary-foreground">
              {review.comments.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3 p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Submit review</p>
          <p className="text-xs text-muted-foreground">
            {comments.length === 0
              ? "No inline comments yet — select lines in a diff to add them."
              : `${comments.length} inline comment${comments.length === 1 ? "" : "s"} will be posted with this review.`}
          </p>
          {unanchoredCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {unanchoredCount} comment
              {unanchoredCount === 1 ? "" : "s"} cannot be anchored to a line
              and will be left out.
            </p>
          ) : null}
        </div>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a summary comment…"
          aria-label="Review summary"
          className="min-h-20 text-sm"
        />

        <div className="flex flex-col gap-1">
          {EVENT_OPTIONS.map((option) => (
            <button
              key={option.event}
              type="button"
              aria-pressed={event === option.event}
              onClick={() => setEvent(option.event)}
              className={cn(
                "flex flex-col rounded-md border px-2 py-1.5 text-left transition-colors",
                event === option.event
                  ? "border-border bg-muted"
                  : "border-transparent hover:bg-muted/60",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                {event === option.event ? (
                  <IconCheck className="size-3.5 text-primary" />
                ) : (
                  <span className="size-3.5" />
                )}
                {option.label}
              </span>
              <span className="pl-5 text-[11px] text-muted-foreground">
                {option.hint}
              </span>
            </button>
          ))}
        </div>

        {error ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <IconX className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={isSubmitting || !hasContent}
          >
            {isSubmitting ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
