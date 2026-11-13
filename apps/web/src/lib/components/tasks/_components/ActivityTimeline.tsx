"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Button,
  ConversationEmptyState,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  toast,
  useRequestConfirm,
  ListEnter,
} from "@vvedantb/ui";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { CreatedTimelineItem } from "./CreatedTimelineItem";
import { TaskActivityItem } from "./TaskActivityItem";
import { TaskActivityComposer } from "./TaskActivityComposer";
import { CommentThread } from "./CommentThread";
import {
  buildRepliesByParentId,
  DELETED_COMMENT_PLACEHOLDER,
  getTopLevelComments,
} from "../_utils/commentThread";

type Comments = FunctionReturnType<typeof api.taskComments.listByTask>;
type Comment = NonNullable<Comments>[number];
type TaskActivity = FunctionReturnType<typeof api.taskActivity.listByTask>;
type TaskActivityEvent = NonNullable<TaskActivity>[number];
type Users = FunctionReturnType<typeof api.users.listAll>;
type User = NonNullable<Users>[number];

type ActivityItem =
  | {
      kind: "created";
      timestamp: number;
    }
  | {
      kind: "taskActivity";
      timestamp: number;
      activity: TaskActivityEvent;
    }
  | {
      kind: "comment";
      timestamp: number;
      comment: Comment;
    };

export function ActivityTimeline({
  taskId,
  createdAt,
  creatorUser,
  comments,
  taskActivity,
  users,
  isProjectTask,
}: {
  taskId: Id<"agentTasks">;
  createdAt: number | undefined;
  creatorUser: User | undefined;
  isProjectTask: boolean;
  comments: Comments | undefined;
  taskActivity: TaskActivity | undefined;
  users: Users | undefined;
}) {
  const [deletingCommentId, setDeletingCommentId] =
    useState<Id<"taskComments"> | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();

  const removeComment = useMutation(
    api.taskComments.remove,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(localStore, api.taskComments.listByTask, { taskId }, (cur) =>
      cur.map((entry) =>
        entry._id === args.id
          ? {
              ...entry,
              deletedAt: Date.now(),
              content: DELETED_COMMENT_PLACEHOLDER,
            }
          : entry,
      ),
    );
  });
  const deleteComment = async (commentId: Id<"taskComments">) => {
    setIsDeletingComment(true);
    try {
      await removeComment({ id: commentId });
      setDeletingCommentId(null);
    } catch (err) {
      console.error("Failed to delete comment:", err);
      toast.error("Could not delete the comment. Try again.");
    }
    setIsDeletingComment(false);
  };

  const handleDeleteComment = async () => {
    if (!deletingCommentId) return;
    await deleteComment(deletingCommentId);
  };

  const userComments = comments?.filter((c) => c.authorId) ?? [];
  const topLevelComments = getTopLevelComments(userComments);
  const repliesByParentId = buildRepliesByParentId(userComments);

  // Comments and task updates only: agent runs live in the sandbox chat.
  const activityTimeline: ActivityItem[] = [
    ...(createdAt !== undefined
      ? [{ kind: "created" as const, timestamp: createdAt }]
      : []),
    ...(taskActivity ?? []).map((activity) => ({
      kind: "taskActivity" as const,
      timestamp: activity.createdAt,
      activity,
    })),
    ...topLevelComments.map((comment) => ({
      kind: "comment" as const,
      timestamp: comment.createdAt,
      comment,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  // Comments sit in cards off the rail; contiguous non-comment events share a line.
  type TimelineSegment =
    | { kind: "rail"; items: ActivityItem[] }
    | { kind: "comment"; item: Extract<ActivityItem, { kind: "comment" }> };

  const segments: TimelineSegment[] = [];
  for (const item of activityTimeline) {
    if (item.kind === "comment") {
      segments.push({ kind: "comment", item });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.kind === "rail") {
      last.items.push(item);
    } else {
      segments.push({ kind: "rail", items: [item] });
    }
  }

  const renderTimelineItem = (item: ActivityItem) => {
    if (item.kind === "created") {
      return (
        <CreatedTimelineItem
          key="created"
          createdAt={item.timestamp}
          creatorUser={creatorUser}
          isProjectTask={isProjectTask}
        />
      );
    }
    if (item.kind === "taskActivity") {
      return (
        <TaskActivityItem
          key={`activity-${item.activity._id}`}
          event={item.activity}
          users={users}
        />
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
        {activityTimeline.length === 0 ? (
          <ConversationEmptyState title="No activity yet" />
        ) : (
          segments.map((segment, segmentIndex) => {
            if (segment.kind === "comment") {
              const comment = segment.item.comment;
              return (
                <ListEnter
                  key={`comment-${comment._id}`}
                  index={segmentIndex}
                  fast
                >
                  <CommentThread
                    comment={comment}
                    taskId={taskId}
                    users={users}
                    repliesByParentId={repliesByParentId}
                    onDeleteRequest={(commentId) =>
                      requestConfirm(
                        () => setDeletingCommentId(commentId),
                        () => {
                          void deleteComment(commentId);
                        },
                      )
                    }
                  />
                </ListEnter>
              );
            }

            return (
              <ListEnter
                key={`rail-${segment.items
                  .map((item) =>
                    item.kind === "taskActivity"
                      ? item.activity._id
                      : "created",
                  )
                  .join("-")}`}
                index={segmentIndex}
                // Indented by the comment card's own row padding (14px) so rail
                // avatars sit in the same column as avatars inside the cards.
                className="relative flex flex-col gap-4 pl-3.5"
              >
                {/* Rail only through non-comment events in this contiguous block.
                    22px = 14px indent + half of the 16px avatar slot. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-2 left-[22px] top-2 w-px -translate-x-1/2 bg-border"
                />
                {segment.items.map((item) => renderTimelineItem(item))}
              </ListEnter>
            );
          })
        )}

        <TaskActivityComposer taskId={taskId} />
      </div>

      <Dialog
        open={deletingCommentId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingCommentId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Comment</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this comment? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingCommentId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteComment}
              disabled={isDeletingComment}
            >
              {isDeletingComment && <Spinner variant="circle" size="sm" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
