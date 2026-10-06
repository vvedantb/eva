"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import { Button, Spinner, Textarea, cn, toast } from "@eva/ui";
import { IconCheck, IconX } from "@tabler/icons-react";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { convexErrorMessage } from "@/lib/utils/convexErrorMessage";
import { verdictSuccessTitle } from "./prVerdict";

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

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
 * The composer's Review mode: the line comments drafted on Code plus a summary
 * and a verdict, posted as one GitHub review. eva posts as its GitHub App, and
 * GitHub refuses to let an app approve a pull request it opened — that refusal
 * is shown verbatim rather than guessed at up front.
 */
export function PrReviewForm({
  repoId,
  prNumber,
  body,
  onBodyChange,
  event,
  onEventChange,
  onSubmitted,
}: {
  repoId: Id<"githubRepos">;
  prNumber: number;
  body: string;
  onBodyChange: (body: string) => void;
  event: ReviewEvent;
  onEventChange: (event: ReviewEvent) => void;
  onSubmitted: () => void;
}) {
  const review = usePendingReviewComments();
  const submitPrReview = useAction(api.github.submitPrReview);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only comments drawn on this diff carry a GitHub anchor; ones parsed out of
  // an agent message have diff-relative indices GitHub cannot place.
  const pending = review?.comments ?? [];
  const comments = pending.flatMap((comment) =>
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
  const unanchored = pending.length - comments.length;
  const trimmed = body.trim();
  // GitHub requires a summary on a changes-requested review.
  const canSubmit =
    event === "REQUEST_CHANGES"
      ? trimmed.length > 0
      : event === "APPROVE" || comments.length > 0 || trimmed.length > 0;

  const submit = () => {
    setSubmitting(true);
    setError(null);
    submitPrReview({ repoId, prNumber, event, body: trimmed, comments })
      .then((result) => {
        review?.clear();
        toast.success(verdictSuccessTitle(result.state), {
          description:
            comments.length > 0
              ? `${comments.length} inline comment${comments.length === 1 ? "" : "s"} posted to GitHub.`
              : "Posted to GitHub as the eva app.",
        });
        onSubmitted();
      })
      .catch((cause: unknown) => {
        setError(convexErrorMessage(cause, "GitHub rejected the review."));
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {comments.length === 0
          ? "No line comments yet — select lines in Code to add them."
          : `${comments.length} line comment${comments.length === 1 ? "" : "s"} will be posted with this review.`}
        {unanchored > 0
          ? ` ${unanchored} cannot be anchored to a line and will be left out.`
          : ""}
      </p>
      <Textarea
        autoFocus
        value={body}
        onChange={(change) => onBodyChange(change.target.value)}
        placeholder={
          event === "REQUEST_CHANGES" ? "What has to change?" : "Leave a summary…"
        }
        aria-label="Review summary"
        className="min-h-20 text-sm"
      />
      <div className="flex flex-col gap-1" role="radiogroup" aria-label="Verdict">
        {EVENT_OPTIONS.map((option) => (
          <button
            key={option.event}
            type="button"
            role="radio"
            aria-checked={event === option.event}
            onClick={() => onEventChange(option.event)}
            className={cn(
              "flex flex-col rounded-md px-2 py-1.5 text-left transition-colors",
              event === option.event ? "bg-muted" : "hover:bg-muted/60",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              {event === option.event ? (
                <IconCheck className="size-3.5 text-primary" aria-hidden />
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
      {error === null ? null : (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <IconX className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={submitting || !canSubmit}>
          {submitting ? <Spinner size="sm" /> : null}
          Submit review
        </Button>
      </div>
    </div>
  );
}
