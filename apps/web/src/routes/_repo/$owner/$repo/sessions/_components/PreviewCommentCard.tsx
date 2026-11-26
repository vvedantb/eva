"use client";

import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { compactRelativeTime } from "@eva/shared/dates";
import { useMutation } from "convex/react";
import { cn } from "@eva/ui";
import { Button } from "@vvedantb/ui";
import {
  IconArrowBackUp,
  IconArrowUpRight,
  IconCheck,
} from "@tabler/icons-react";
import { catchMutationError } from "@/lib/utils/mutationToast";

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
  const setResolved = useMutation(api.previewComments.setResolved);
  const resolved = comment.kind === "message" ? comment.resolved : undefined;
  return (
    <div
      className={cn(
        "rounded-lg bg-card p-2.5 smooth-shadow-ring",
        // Done, but still readable: the reader may want to reopen it.
        resolved && "opacity-70",
      )}
    >
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
      {resolved ? (
        <p className="mt-2 text-2xs text-muted-foreground">
          Resolved by {resolved.byName} · {compactRelativeTime(resolved.at)}
        </p>
      ) : null}
      {comment.kind === "message" ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          {/* Same controls as a doc comment thread (DocCommentThread). */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              void catchMutationError(
                setResolved({ id: comment.id, resolved: !resolved }),
                resolved
                  ? "Could not reopen the comment"
                  : "Could not resolve the comment",
                "preview-comment-resolve",
              ).catch(() => {});
            }}
          >
            {resolved ? (
              <IconArrowBackUp className="size-3.5" aria-hidden />
            ) : (
              <IconCheck className="size-3.5" aria-hidden />
            )}
            {resolved ? "Reopen" : "Resolve"}
          </Button>
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
