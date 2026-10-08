"use client";

import { Tooltip, TooltipContent, TooltipTrigger, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconMessage, IconX } from "@tabler/icons-react";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { useDiffSearchParams } from "@/lib/components/sandbox/useDiffSearchParams";

export function PendingReviewCommentChips() {
  const review = usePendingReviewComments();
  const { setDiffFile } = useDiffSearchParams();
  const comments = review?.comments ?? [];

  return (
    <AnimatePresence initial={false}>
      {review && comments.length > 0 ? (
        <m.div
          key="pending-review-chips"
          className="mb-2 flex flex-wrap gap-1.5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={motionFast}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {comments.map((comment) => {
              const label = `${comment.filePath} ${comment.rangeLabel}`;
              return (
                <m.div
                  key={comment.id}
                  layout
                  className="inline-flex max-w-full"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={motionFast}
                >
                  <Tooltip>
                    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card py-0.5 pl-2 pr-1 text-xs text-foreground">
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex min-w-0 flex-1 items-center gap-1 hover:text-foreground"
                          onClick={() => {
                            setDiffFile(comment.filePath);
                            review.openDiffsTab();
                          }}
                        >
                          <IconMessage className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{label}</span>
                        </button>
                      </TooltipTrigger>
                      <button
                        type="button"
                        // 20px painted, so it needs `hit-target` to reach the 40px
                        // minimum — it is the smallest control in the chat composer and
                        // the one most often missed.
                        className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                        aria-label={`Remove comment on ${label}`}
                        onClick={() => review.remove(comment.id)}
                      >
                        <IconX className="size-3" />
                      </button>
                    </span>
                    <TooltipContent
                      side="top"
                      className="max-w-[calc(100vw-2rem)] whitespace-pre-wrap sm:max-w-96"
                    >
                      {comment.text}
                    </TooltipContent>
                  </Tooltip>
                </m.div>
              );
            })}
          </AnimatePresence>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
