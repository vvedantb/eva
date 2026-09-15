"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { UserInitials } from "@eva/shared/user-initials";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  toast,
} from "@eva/ui";
import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";
import { mentionTokensToEditableText } from "@/lib/components/mentions/mentionToken";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useCommentAnchor } from "@/lib/hooks/useCommentAnchor";
import {
  MarkdownMentionText,
  MARKDOWN_PROSE_CLASS,
} from "@/lib/components/chat/MarkdownMentionText";
import { getUserDisplayName } from "./task-detail-constants";
import {
  CommentMentionInput,
  type CommentMentionInputHandle,
} from "./CommentMentionInput";
import { ReactionBar } from "./ReactionBar";
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import { useReactions } from "./TaskReactionsProvider";
import {
  DELETED_COMMENT_PLACEHOLDER,
  isCommentDeleted,
  type TaskComment,
} from "../_utils/commentThread";

type Users = FunctionReturnType<typeof api.users.listAll>;

interface CommentActivityItemProps {
  comment: TaskComment;
  taskId: Id<"agentTasks">;
  users: Users | undefined;
  onDeleteRequest: (commentId: Id<"taskComments">) => void;
}

function CommentAuthorName({
  authorId,
  users,
}: {
  authorId: Id<"users">;
  users: Users | undefined;
}) {
  const fromList = users?.find((user) => user._id === authorId);
  const profile = useQuery(api.users.get, fromList ? "skip" : { id: authorId });

  if (fromList) {
    return (
      <span data-pii className="truncate text-sm font-medium text-foreground">
        {getUserDisplayName(fromList)}
      </span>
    );
  }

  if (profile === undefined) {
    return (
      <span className="truncate text-sm font-medium text-muted-foreground">
        ...
      </span>
    );
  }

  if (profile === null) {
    return (
      <span className="truncate text-sm font-medium text-foreground">
        Unknown
      </span>
    );
  }

  return (
    <span data-pii className="truncate text-sm font-medium text-foreground">
      {getUserDisplayName(profile)}
    </span>
  );
}

export function CommentActivityItem({
  comment,
  taskId,
  users,
  onDeleteRequest,
}: CommentActivityItemProps) {
  const currentUserId = useQuery(api.auth.me);
  const { repo, basePath } = useRepo();
  const { groups, toggle } = useReactions("comment", comment._id);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const editMentionRef = useRef<CommentMentionInputHandle>(null);
  // Anchors a notification click-through. Every task comment renders through
  // this component — root threads, replies, and the comment nested inside a run
  // it triggered — so one hook here covers all three placements.
  const { ref: anchorRef, isAnchored } = useCommentAnchor(comment._id);

  const updateComment = useMutation(
    api.taskComments.update,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.taskComments.listByTask, {
      taskId,
    });
    if (current === undefined) return;
    localStore.setQuery(
      api.taskComments.listByTask,
      { taskId },
      current.map((entry) =>
        entry._id === args.id ? { ...entry, content: args.content } : entry,
      ),
    );
  });

  const isDeleted = isCommentDeleted(comment);
  const isAuthor =
    comment.authorId !== undefined && comment.authorId === currentUserId;
  const canManage = isAuthor && !isDeleted;

  const startEditing = () => {
    setEditText(mentionTokensToEditableText(comment.content));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditText("");
    editMentionRef.current?.reset();
  };

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    const content = editMentionRef.current?.tokenize(trimmed) ?? trimmed;
    setIsSaving(true);
    try {
      await updateComment({ id: comment._id, content });
      // Read into a local and guarded with an if rather than `?.`: React
      // Compiler bails on the whole file when an optional-chaining call sits
      // inside a try/catch.
      const editMention = editMentionRef.current;
      if (editMention) editMention.reset();
      setIsEditing(false);
      setEditText("");
    } catch (err) {
      console.error("Failed to update comment:", err);
      toast.error("Could not save the comment. Try again.");
    }
    setIsSaving(false);
  };

  return (
    <div
      ref={anchorRef}
      data-comment-id={comment._id}
      className={cn("group", isAnchored && "rounded-surface t-anchor-flash")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {comment.authorId ? (
            <UserInitials userId={comment.authorId} size="sm" />
          ) : null}
          {comment.authorId ? (
            <CommentAuthorName authorId={comment.authorId} users={users} />
          ) : (
            <span className="truncate text-sm font-medium text-foreground">
              Unknown
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isEditing && !isDeleted ? (
            <EmojiReactionPicker onSelect={toggle} variant="ghost" />
          ) : null}
          {canManage && !isEditing ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  // `icon-sm` carries `hit-target`, so the visible 32px button
                  // has a 48px pressable area — the hand-rolled `h-7 w-7` it
                  // replaces had neither that nor a way to be reached on touch.
                  className="reveal-on-hover text-muted-foreground"
                  aria-label="Comment options"
                >
                  <IconDots size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={startEditing}>
                  <IconPencil size={14} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  title={skipConfirmTitle("Delete")}
                  onClick={() => onDeleteRequest(comment._id)}
                >
                  <IconTrash size={14} />
                  Delete
                  <ConfirmSkipHint />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <RelativeDateTime
            at={comment.createdAt}
            className="shrink-0 pl-1 text-[11px] text-muted-foreground/60"
          />
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <CommentMentionInput
            ref={editMentionRef}
            value={editText}
            onValueChange={setEditText}
            placeholder="Edit comment..."
            className="min-h-0 max-h-60"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={cancelEditing}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveEdit}
              disabled={isSaving || editText.trim() === ""}
            >
              Save
            </Button>
          </div>
        </div>
      ) : isDeleted ? (
        <p className="pl-6 text-sm italic text-muted-foreground">
          {DELETED_COMMENT_PLACEHOLDER}
        </p>
      ) : (
        <MarkdownMentionText
          text={comment.content}
          repoBasePath={basePath}
          repoId={repo._id}
          atKind="user"
          className={`${MARKDOWN_PROSE_CLASS} pl-6 text-sm wrap-break-word`}
        />
      )}

      {!isEditing && !isDeleted ? (
        <div className="mt-2 pl-6">
          <ReactionBar groups={groups} toggle={toggle} />
        </div>
      ) : null}
    </div>
  );
}
