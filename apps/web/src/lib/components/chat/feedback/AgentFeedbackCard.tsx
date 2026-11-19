"use client";

import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { Button, Surface, toast, tokenTransition } from "@vvedantb/ui";
import { IconThumbDown, IconThumbUp, IconTrash } from "@tabler/icons-react";
import { m } from "motion/react";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";

/**
 * Feedback the agent sent in this turn (`submit_feedback`), shown under its
 * reply so the user sees exactly what went to the Feedback page and can
 * delete it.
 */
export function AgentFeedbackCard({
  feedback,
}: {
  feedback: {
    _id: Id<"feedback">;
    sentiment: FeedbackSentiment;
    comment?: string;
  };
}) {
  const remove = useMutation(api.feedback.remove);
  const Icon = feedback.sentiment === "positive" ? IconThumbUp : IconThumbDown;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
    >
      <Surface density="tight" className="flex min-w-0 items-center gap-3">
        <Icon size={18} className="shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-foreground">
            Feedback sent
          </span>
          {feedback.comment ? (
            <span className="text-xs text-muted-foreground">
              {feedback.comment}
            </span>
          ) : null}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="Delete feedback"
          title="Delete feedback"
          onClick={() => {
            void remove({ feedbackId: feedback._id }).catch(() =>
              toast.error("Could not delete feedback"),
            );
          }}
        >
          <IconTrash size={16} />
        </Button>
      </Surface>
    </m.div>
  );
}
