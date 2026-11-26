"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Button,
  MessageAction,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Textarea,
  toast,
} from "@vvedantb/ui";
import { cn } from "@eva/ui";
import {
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
} from "@tabler/icons-react";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";

const PROMPTS: Record<FeedbackSentiment, string> = {
  positive: "What went well? (optional)",
  negative: "What went wrong? (optional)",
};

/**
 * Thumbs up / down on one finished Eva turn. A click saves the rating at once
 * and opens a comment box; clicking the active thumb again clears it. One
 * rating per user per turn (`feedback.rateTurn`), listed on /feedback.
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
  // The open comment box: which thumb opened it and the text so far. Local so
  // the box opens on click, before the saved rating comes back.
  const [draft, setDraft] = useState<{
    sentiment: FeedbackSentiment;
    text: string;
  } | null>(null);

  const save = (next: FeedbackSentiment | null, nextComment?: string) => {
    void rateTurn({
      messageId,
      sentiment: next,
      ...(nextComment !== undefined ? { comment: nextComment } : {}),
    }).catch(() => toast.error("Could not save feedback"));
  };

  const onThumb = (next: FeedbackSentiment) => {
    if (sentiment === next) {
      save(null);
      setDraft(null);
      return;
    }
    save(next);
    setDraft({ sentiment: next, text: comment ?? "" });
  };

  return (
    <Popover open={draft !== null} onOpenChange={(next) => !next && setDraft(null)}>
      <PopoverAnchor asChild>
        <span className="inline-flex items-center gap-0.5">
          {(["positive", "negative"] as const).map((value) => {
            const active = sentiment === value;
            const Icon =
              value === "positive"
                ? active
                  ? IconThumbUpFilled
                  : IconThumbUp
                : active
                  ? IconThumbDownFilled
                  : IconThumbDown;
            const label = value === "positive" ? "Good reply" : "Bad reply";
            return (
              <MessageAction
                key={value}
                tooltip={active ? "Remove rating" : label}
                label={label}
                size="icon-xs"
                aria-pressed={active}
                onClick={() => onThumb(value)}
                className={cn(
                  "hit-target text-muted-foreground hover:text-foreground",
                  active && "text-foreground",
                )}
              >
                <Icon className="size-4" />
              </MessageAction>
            );
          })}
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-72 space-y-2 p-3"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Textarea
          value={draft?.text ?? ""}
          onChange={(event) =>
            setDraft(
              draft ? { sentiment: draft.sentiment, text: event.target.value } : null,
            )
          }
          placeholder={draft ? PROMPTS[draft.sentiment] : undefined}
          rows={3}
          className="text-xs"
          autoFocus
        />
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDraft(null)}
          >
            Skip
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (draft) save(draft.sentiment, draft.text);
              setDraft(null);
            }}
          >
            Send
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
