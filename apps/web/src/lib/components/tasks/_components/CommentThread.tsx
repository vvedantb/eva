"use client";

import type { Id, api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { Separator, Surface, cn } from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { CommentActivityItem } from "./CommentActivityItem";
import { CommentReplyComposer } from "./CommentReplyComposer";
import type { TaskComment } from "../_utils/commentThread";

type Users = FunctionReturnType<typeof api.users.listAll>;

/** Subtle dividers inside comment threads — tuned per theme on `bg-muted/40`. */
const THREAD_SEPARATOR_CLASS = "bg-foreground/5 dark:bg-foreground/5";

/** Horizontal padding of every row in the thread card. */
const THREAD_ROW_X_CLASS = "px-3.5";

interface CommentThreadProps {
  comment: TaskComment;
  taskId: Id<"agentTasks">;
  users: Users | undefined;
  repliesByParentId: Map<Id<"taskComments">, TaskComment[]>;
  onDeleteRequest: (commentId: Id<"taskComments">) => void;
  depth?: number;
}

function ReplyThreads({
  replies,
  taskId,
  users,
  repliesByParentId,
  onDeleteRequest,
  depth,
}: {
  replies: TaskComment[];
  taskId: Id<"agentTasks">;
  users: Users | undefined;
  repliesByParentId: Map<Id<"taskComments">, TaskComment[]>;
  onDeleteRequest: (commentId: Id<"taskComments">) => void;
  depth: number;
}) {
  if (replies.length === 0) return null;

  // A direct reply to the root comment is a row of the thread card, so it takes
  // the card's own padding and an edge-to-edge divider (Linear-style). Deeper
  // replies sit inside their parent's row and are grouped by indent alone.
  const isCardRow = depth === 0;

  return (
    <div className={isCardRow ? undefined : "mt-3 space-y-3 pl-6"}>
      {replies.map((reply, index) => (
        <ListEnter key={reply._id} index={index} fast>
          {isCardRow ? <Separator className={THREAD_SEPARATOR_CLASS} /> : null}
          <div
            className={isCardRow ? cn(THREAD_ROW_X_CLASS, "py-3") : undefined}
          >
            <CommentThread
              comment={reply}
              taskId={taskId}
              users={users}
              repliesByParentId={repliesByParentId}
              onDeleteRequest={onDeleteRequest}
              depth={depth + 1}
            />
          </div>
        </ListEnter>
      ))}
    </div>
  );
}

export function CommentThread({
  comment,
  taskId,
  users,
  repliesByParentId,
  onDeleteRequest,
  depth = 0,
}: CommentThreadProps) {
  const replies = repliesByParentId.get(comment._id) ?? [];

  if (depth === 0) {
    // The card owns no padding: comment, replies and the reply composer are
    // rows, so their dividers reach the card edge instead of floating inside it.
    return (
      <Surface density="none" className="overflow-hidden">
        <div className={cn(THREAD_ROW_X_CLASS, "py-3")}>
          <CommentActivityItem
            comment={comment}
            taskId={taskId}
            users={users}
            onDeleteRequest={onDeleteRequest}
          />
        </div>
        <ReplyThreads
          replies={replies}
          taskId={taskId}
          users={users}
          repliesByParentId={repliesByParentId}
          onDeleteRequest={onDeleteRequest}
          depth={depth}
        />
        <Separator className={THREAD_SEPARATOR_CLASS} />
        <div className={cn(THREAD_ROW_X_CLASS, "py-2")}>
          <CommentReplyComposer taskId={taskId} parentId={comment._id} />
        </div>
      </Surface>
    );
  }

  return (
    <div>
      <CommentActivityItem
        comment={comment}
        taskId={taskId}
        users={users}
        onDeleteRequest={onDeleteRequest}
      />
      <ReplyThreads
        replies={replies}
        taskId={taskId}
        users={users}
        repliesByParentId={repliesByParentId}
        onDeleteRequest={onDeleteRequest}
        depth={depth}
      />
    </div>
  );
}
