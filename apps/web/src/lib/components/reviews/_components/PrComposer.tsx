"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@eva/ui";
import { IconMessage, IconTrash, IconX } from "@tabler/icons-react";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { PrCommentForm } from "./PrCommentForm";
import { PrReviewForm, type ReviewEvent } from "./PrReviewForm";

type ComposerMode = "comment" | "review";

/**
 * The single floating control over a pull request, as t3code has it: commenting
 * on the change and submitting the review that carries Code's line comments are
 * two modes of one composer rather than two buttons in two places.
 *
 * Opening picks the mode with work waiting in it, so a reader who has drafted
 * line comments lands on the review and everyone else on the comment box. The
 * drafts live here, above the popover, so neither is lost to a toggle or a
 * dismissal.
 */
export function PrComposer({
  repoId,
  prNumber,
  isOpen,
  onPosted,
}: {
  repoId: Id<"githubRepos">;
  prNumber: number;
  /** A closed or merged pull request still takes comments, but no verdict. */
  isOpen: boolean;
  onPosted: () => void;
}) {
  const review = usePendingReviewComments();
  const pending = review?.comments.length ?? 0;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ComposerMode>("comment");
  const [commentBody, setCommentBody] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>("COMMENT");
  const canReview = review !== null && isOpen;
  const activeMode: ComposerMode = canReview ? mode : "comment";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setMode(pending > 0 ? "review" : "comment");
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="secondary"
          className="relative rounded-full bg-popover/95 backdrop-blur-md smooth-shadow-ring-md"
          aria-label={
            pending > 0
              ? `Review pull request, ${pending} ${pending === 1 ? "comment" : "comments"} pending`
              : "Comment on pull request"
          }
        >
          <IconMessage aria-hidden />
          {pending > 0 ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground"
            >
              {pending}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-[min(26rem,calc(100vw-2rem))] p-3"
        aria-label="Pull request composer"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          {canReview ? (
            <Tabs
              value={activeMode}
              onValueChange={(value) => {
                if (value === "comment" || value === "review") setMode(value);
              }}
            >
              <TabsList size="sm" className="tabs-segmented h-8">
                <TabsTrigger value="comment">Comment</TabsTrigger>
                <TabsTrigger value="review">
                  {pending > 0 ? `Review (${pending})` : "Review"}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <p className="text-sm font-medium">Comment on pull request</p>
          )}
          <div className="flex items-center gap-1">
            {activeMode === "review" && pending > 0 ? (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Discard pending line comments"
                title="Discard pending line comments"
                onClick={() => review?.clear()}
              >
                <IconTrash aria-hidden />
              </Button>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Close composer"
              onClick={() => setOpen(false)}
            >
              <IconX aria-hidden />
            </Button>
          </div>
        </div>
        {activeMode === "comment" ? (
          <PrCommentForm
            repoId={repoId}
            prNumber={prNumber}
            body={commentBody}
            onBodyChange={setCommentBody}
            onPosted={() => {
              setCommentBody("");
              setOpen(false);
              onPosted();
            }}
          />
        ) : (
          <PrReviewForm
            repoId={repoId}
            prNumber={prNumber}
            body={reviewBody}
            onBodyChange={setReviewBody}
            event={reviewEvent}
            onEventChange={setReviewEvent}
            onSubmitted={() => {
              setReviewBody("");
              setOpen(false);
              onPosted();
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
