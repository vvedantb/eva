"use client";

import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { UserInitials } from "@eva/shared/user-initials";
import {
  Button,
  cn,
  LIST_ROW_CONTROL_CLASS,
  Textarea,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconCheck, IconArrowBackUp } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { useState, useEffect, useRef } from "react";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { useCommentAnchor } from "@/lib/hooks/useCommentAnchor";

type DocComment = FunctionReturnType<typeof api.docComments.listByDoc>[number];

/** 24px beside a pointer, a full 40px tap target below `sm`. */
const THREAD_ACTION_CLASS = "h-6 px-1.5 text-xs max-sm:h-10 max-sm:px-3";

export function DocCommentThread({
  root,
  replies,
  docId,
  isActive,
  isOrphaned,
  onClick,
}: {
  root: DocComment;
  replies: DocComment[];
  docId: Id<"docs">;
  isActive: boolean;
  isOrphaned: boolean;
  onClick: () => void;
}) {
  const setResolved = useMutation(api.docComments.setResolved);
  const createComment = useMutation(api.docComments.create);
  const [replyContent, setReplyContent] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // A notification for a reply carries the reply's id, but the whole thread
  // renders as one card — so the card is what scrolls and flashes.
  const { ref: anchorRef, isAnchored } = useCommentAnchor(
    root._id,
    (anchorId) => replies.some((reply) => reply._id === anchorId),
  );

  const isResolved = root.resolvedAt !== undefined;

  /* eslint-disable no-effect/no-event-handler --
     The click happens on a highlight inside the editor, in a different subtree;
     all this thread can do is scroll itself once it learns it is active. */
  // Bring the thread into view when its highlight is clicked in the editor.
  useEffect(() => {
    if (isActive) {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);
  /* eslint-enable no-effect/no-event-handler */

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    try {
      await catchMutationError(
        createComment({
          docId,
          content: replyContent.trim(),
          parentId: root._id,
        }),
        "Couldn't post reply",
        "doc-comment-reply",
      );
      setReplyContent("");
      setIsReplying(false);
    } catch {
      // toast already shown
    }
  };

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        anchorRef(node);
      }}
      data-comment-id={root._id}
      className={cn(
        "relative border-b border-border p-3 transition-colors",
        isActive && "bg-accent/50 ring-1 ring-inset ring-ring",
        isAnchored && "t-anchor-flash",
      )}
    >
      {/* A real button stretched across the thread rather than `onClick` on the
          wrapper, which had no role and no keyboard path. The thread's own
          controls sit above it with `LIST_ROW_CONTROL_CLASS`. */}
      <button
        type="button"
        aria-label="Scroll to the commented text"
        onClick={onClick}
        className="absolute inset-0 z-1 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
      />
      {root.anchorText && (
        <div className="mb-2 rounded border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground line-clamp-2 italic">
          &ldquo;{root.anchorText}&rdquo;
        </div>
      )}
      {root.resolutionTarget === "agent" && !isResolved ? (
        <div className="mb-2 inline-flex rounded border border-border bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          For Eva
        </div>
      ) : null}
      {isOrphaned && (
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-warning">
          Original text deleted
        </div>
      )}

      <DocCommentItem comment={root} />

      {replies.map((reply, index) => (
        <ListEnter key={reply._id} index={index} fast>
          <div className="ml-3 mt-2 border-l-2 border-border pl-2">
            <DocCommentItem comment={reply} />
          </div>
        </ListEnter>
      ))}

      <div
        className={cn(
          LIST_ROW_CONTROL_CLASS,
          "mt-2 flex max-sm:flex-wrap items-center gap-1 max-sm:gap-2",
        )}
      >
        {!isResolved ? (
          <Button
            size="sm"
            variant="ghost"
            className={THREAD_ACTION_CLASS}
            onClick={() => {
              catchMutationError(
                setResolved({ id: root._id, resolved: true }),
                "Couldn't resolve comment",
                "doc-comment-resolve",
              );
            }}
          >
            <IconCheck size={12} aria-hidden />
            Resolve
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={THREAD_ACTION_CLASS}
            onClick={() => {
              catchMutationError(
                setResolved({ id: root._id, resolved: false }),
                "Couldn't reopen comment",
                "doc-comment-reopen",
              );
            }}
          >
            <IconArrowBackUp size={12} aria-hidden />
            Reopen
          </Button>
        )}

        {!isReplying && (
          <Button
            size="sm"
            variant="ghost"
            className={THREAD_ACTION_CLASS}
            onClick={() => setIsReplying(true)}
          >
            Reply
          </Button>
        )}
      </div>

      <AnimatePresence>
        {isReplying && (
          <m.div
            className={cn(LIST_ROW_CONTROL_CLASS, "mt-2")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Reply..."
              rows={2}
              className="text-sm"
              autoFocus
            />
            <div className="mt-1.5 flex justify-end gap-1 max-sm:gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs max-sm:h-10 max-sm:px-3"
                onClick={() => {
                  setIsReplying(false);
                  setReplyContent("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-xs max-sm:h-10 max-sm:px-3"
                disabled={!replyContent.trim()}
                onClick={handleReply}
              >
                Reply
              </Button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Resolves a comment author's display name, accounting for the query's
 *  loading (undefined) and not-found (null) states. */
function authorDisplayName(
  user: FunctionReturnType<typeof api.users.get> | undefined,
): string {
  if (user === undefined) return "…";
  if (user === null) return "Unknown";
  if (user.fullName?.trim()) return user.fullName.trim();
  const parts = [user.firstName, user.lastName].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  if (parts.length > 0) return parts.join(" ");
  if (user.email?.trim()) return user.email.trim();
  return "Unknown";
}

function DocCommentItem({ comment }: { comment: DocComment }) {
  const isDeleted = comment.deletedAt !== undefined;
  // Cached query — dedupes with the UserInitials avatar's own users.get fetch.
  const author = useQuery(
    api.users.get,
    comment.authorId ? { id: comment.authorId } : "skip",
  );
  const name = comment.authorId ? authorDisplayName(author) : "Unknown";

  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        {comment.authorId ? (
          <UserInitials userId={comment.authorId} size="sm" />
        ) : null}
        <span data-pii className="font-medium text-xs">
          {name}
        </span>
        <RelativeDateTime
          at={comment.createdAt}
          className="text-[10px] text-muted-foreground"
        />
      </div>
      <p
        className={cn(
          "mt-0.5 text-xs leading-relaxed",
          isDeleted && "italic text-muted-foreground",
        )}
      >
        {comment.content}
      </p>
    </div>
  );
}
