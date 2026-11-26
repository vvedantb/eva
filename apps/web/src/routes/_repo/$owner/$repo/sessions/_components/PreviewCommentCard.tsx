"use client";

import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";
import { compactRelativeTime } from "@eva/shared/dates";
import { Button } from "@vvedantb/ui";
import { IconArrowUpRight } from "@tabler/icons-react";

export type PreviewComment = FunctionReturnType<
  typeof api.previewComments.list
>[number];

/** One preview annotation: what was said, where, and how Eva answered. */
export function PreviewCommentCard({
  comment,
  onViewInChat,
}: {
  comment: PreviewComment;
  onViewInChat: (messageId: Id<"messages">) => void;
}) {
  return (
    <div className="rounded-lg bg-card p-2.5 smooth-shadow-ring">
      <div className="mb-1.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
        <span className="min-w-0 truncate rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-foreground">
          {comment.element}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          {compactRelativeTime(comment.timestamp)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">
        {comment.feedback}
      </p>
      <CommentReply comment={comment} />
      {comment.kind === "message" ? (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => onViewInChat(comment.id)}
          >
            View in chat
            <IconArrowUpRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CommentReply({ comment }: { comment: PreviewComment }) {
  if (comment.kind === "queued") {
    return (
      <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-warning">
        Queued, sends when Eva finishes
      </p>
    );
  }
  const reply = comment.reply;
  // Stopped and failed turns show their own row in the chat.
  if (!reply || reply.status === "stopped" || reply.status === "failed") {
    return null;
  }
  return (
    <div className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
      <p className="mb-0.5 font-medium text-foreground">Eva</p>
      {reply.status === "working" ? (
        <p className="flex items-center gap-1.5">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          Working…
        </p>
      ) : (
        <p className="line-clamp-3 break-words">{reply.excerpt}</p>
      )}
    </div>
  );
}
