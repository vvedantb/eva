"use client";

import { Button, Textarea, motionFast } from "@eva/ui";
import { IconMessage, IconTrash } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

interface DiffCommentDraftBoxProps {
  rangeLabel: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}

export function DiffCommentDraftBox({
  rangeLabel,
  onCancel,
  onSubmit,
}: DiffCommentDraftBoxProps) {
  const [text, setText] = useState("");

  return (
    <AnimatePresence>
    <m.div
      className="mx-2 my-2 rounded-lg border border-border bg-card p-3"
      contentEditable={false}
      onPointerDown={(event) => event.stopPropagation()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={motionFast}
    >
      <div className="flex items-center gap-2">
        <IconMessage className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Review comment</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Comment on lines {rangeLabel}
      </div>
      <Textarea
        autoFocus
        className="mt-3 min-h-16 text-sm"
        value={text}
        placeholder="Request a change..."
        aria-label={`Comment on lines ${rangeLabel}`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key === "Enter" &&
            text.trim()
          ) {
            event.preventDefault();
            onSubmit(text.trim());
          }
        }}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!text.trim()}
          onClick={() => onSubmit(text.trim())}
        >
          Comment
        </Button>
      </div>
    </m.div>
    </AnimatePresence>
  );
}

interface DiffCommentPendingCardProps {
  rangeLabel: string;
  text: string;
  onDelete: () => void;
}

export function DiffCommentPendingCard({
  rangeLabel,
  text,
  onDelete,
}: DiffCommentPendingCardProps) {
  return (
    <AnimatePresence>
    <m.div
      className="mx-2 my-2 rounded-lg border border-border bg-card p-3"
      contentEditable={false}
      onPointerDown={(event) => event.stopPropagation()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={motionFast}
    >
      <div className="flex items-center gap-2">
        <IconMessage className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium">Review comment</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {rangeLabel}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete comment"
          onClick={onDelete}
        >
          <IconTrash className="size-3.5" />
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {text}
      </p>
    </m.div>
    </AnimatePresence>
  );
}
