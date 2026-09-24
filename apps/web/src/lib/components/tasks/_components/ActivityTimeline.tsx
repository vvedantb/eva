"use client";

import { lazy, Suspense, useState } from "react";
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
} from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { IconLoader2 } from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import { requestConfirm, useAltHeld } from "@/lib/confirm";
import type { Id } from "@eva/backend";
import { CreatedTimelineItem } from "./CreatedTimelineItem";
import { TaskActivityItem } from "./TaskActivityItem";
import { TaskActivityComposer } from "./TaskActivityComposer";
import { CommentThread } from "./CommentThread";
import {
  buildRepliesByParentId,
  DELETED_COMMENT_PLACEHOLDER,
  getTopLevelComments,
} from "../_utils/commentThread";

const RunTimelineItem = lazy(() =>
  import("./RunTimelineItem").then((m) => ({ default: m.RunTimelineItem })),
);

type Runs = FunctionReturnType<typeof api.agentRuns.listByTask>;
type Comments = FunctionReturnType<typeof api.taskComments.listByTask>;
type Comment = NonNullable<Comments>[number];
type Streaming = FunctionReturnType<typeof api.streaming.get>;
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
      kind: "run";
      timestamp: number;
      run: NonNullable<Runs>[number];
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
  runs,
  activityInChatRunId,
  comments,
  taskActivity,
  users,
  streaming,
  activeRunElapsed,
  isStopping,
  onStopConfirm,
  isProjectTask,
}: {
  taskId: Id<"agentTasks">;
  createdAt: number | undefined;
  creatorUser: User | undefined;
  isProjectTask: boolean;
  runs: Runs | undefined;
  /**
   * The run whose live activity belongs to the sandbox chat instead of this
   * timeline. Its row still renders (status, timing, Stop) with the activity
   * steps and log left out.
   */
  activityInChatRunId?: Id<"agentRuns">;
  comments: Comments | undefined;
  taskActivity: TaskActivity | undefined;
  users: Users | undefined;
  streaming: Streaming | undefined;
  activeRunElapsed: number;
  isStopping: boolean;
  onStopConfirm: () => void;
}) {
  const [deletingCommentId, setDeletingCommentId] =
    useState<Id<"taskComments"> | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const altHeld = useAltHeld();

  const removeComment = useMutation(
    api.taskComments.remove,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.taskComments.listByTask, {
      taskId,
    });
    if (current !== undefined) {
      localStore.setQuery(
        api.taskComments.listByTask,
        { taskId },
        current.map((entry) =>
          entry._id === args.id
            ? {
                ...entry,
                deletedAt: Date.now(),
                content: DELETED_COMMENT_PLACEHOLDER,
              }
            : entry,
        ),
      );
    }
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

  // Link each run to the change-request comment that actually triggered it,
  // recorded on the run as `triggeringCommentId`. Runs without one (initial
  // task runs, Resolve Conflicts, legacy runs) intentionally have no comment.
  const commentById = new Map(topLevelComments.map((c) => [c._id, c]));
  const runCommentMap = new Map<string, (typeof topLevelComments)[number]>();
  for (const run of runs ?? []) {
    if (!run.triggeringCommentId) continue;
    const comment = commentById.get(run.triggeringCommentId);
    if (comment) runCommentMap.set(run._id, comment);
  }

  const commentsShownWithRuns = new Set(
    [...runCommentMap.values()].map((comment) => comment._id),
  );

  const sortedRunsDesc = [...(runs ?? [])].sort(
    (a, b) =>
      (b.startedAt ?? b._creationTime) - (a.startedAt ?? a._creationTime),
  );

  const activityTimeline: ActivityItem[] = [
    ...(createdAt !== undefined
      ? [{ kind: "created" as const, timestamp: createdAt }]
      : []),
    ...sortedRunsDesc.map((run) => ({
      kind: "run" as const,
      timestamp: run.startedAt ?? run._creationTime,
      run,
    })),
    ...(taskActivity ?? []).map((activity) => ({
      kind: "taskActivity" as const,
      timestamp: activity.createdAt,
      activity,
    })),
    ...topLevelComments.flatMap((comment) =>
      commentsShownWithRuns.has(comment._id)
        ? []
        : [
            {
              kind: "comment" as const,
              timestamp: comment.createdAt,
              comment,
            },
          ],
    ),
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
    if (item.kind === "comment") {
      return null;
    }
    const run = item.run;
    const isActiveRun = run.status === "running" || run.status === "queued";
    const runComment = runCommentMap.get(run._id);
    return (
      <Suspense key={run._id} fallback={<Spinner size="sm" />}>
        <RunTimelineItem
          run={run}
          isActiveRun={isActiveRun}
          activityInChat={run._id === activityInChatRunId}
          streaming={streaming}
          activeRunElapsed={activeRunElapsed}
          isStopping={isStopping}
          onStopConfirm={onStopConfirm}
          runComment={runComment}
          runCommentReplies={
            runComment ? (repliesByParentId.get(runComment._id) ?? []) : []
          }
          users={users}
        />
      </Suspense>
    );
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
                        altHeld,
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
                    item.kind === "run"
                      ? item.run._id
                      : item.kind === "taskActivity"
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
              {isDeletingComment && (
                <IconLoader2 size={16} className="animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
