"use client";

import type { Id, api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { cn } from "@eva/ui";
import { Separator, Surface, ListEnter } from "@vvedantb/ui";
import { CommentActivityItem } from "./CommentActivityItem";
import { CommentReplyComposer } from "./CommentReplyComposer";
import type { TaskComment } from "@eva/shared/taskDetail";

type Users = FunctionReturnType<typeof api.users.listAll>;

const THREAD_SEPARATOR_CLASS = "bg-foreground/5 dark:bg-foreground/5";

const THREAD_ROW_X_CLASS = "px-3.5";

interface CommentThreadProps {
  comment: TaskComment;
  taskId: Id<"agentTasks">;
  users: Users | undefined;
  repliesByParentId: Map<Id<"taskComments">, TaskComment[]>;
  onDeleteRequest: (commentId: Id<"taskComments">) => void;
  depth?: number;
  readOnly?: boolean;
}

function ReplyThreads({
  replies,
  taskId,
  users,
  repliesByParentId,
  onDeleteRequest,
  depth,
  readOnly,
}: {
  replies: TaskComment[];
  taskId: Id<"agentTasks">;
  users: Users | undefined;
  repliesByParentId: Map<Id<"taskComments">, TaskComment[]>;
  onDeleteRequest: (commentId: Id<"taskComments">) => void;
  depth: number;
  readOnly: boolean;
}) {
  if (replies.length === 0) return null;

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
              readOnly={readOnly}
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
  readOnly = false,
}: CommentThreadProps) {
  const replies = repliesByParentId.get(comment._id) ?? [];

  if (depth === 0) {
    return (
      <Surface density="none" className="overflow-hidden">
        <div className={cn(THREAD_ROW_X_CLASS, "py-3")}>
          <CommentActivityItem
            comment={comment}
            taskId={taskId}
            users={users}
            onDeleteRequest={onDeleteRequest}
            readOnly={readOnly}
          />
        </div>
        <ReplyThreads
          replies={replies}
          taskId={taskId}
          users={users}
          repliesByParentId={repliesByParentId}
          onDeleteRequest={onDeleteRequest}
          depth={depth}
          readOnly={readOnly}
        />
        {readOnly ? null : (
          <>
            <Separator className={THREAD_SEPARATOR_CLASS} />
            <div className={cn(THREAD_ROW_X_CLASS, "py-2")}>
              <CommentReplyComposer taskId={taskId} parentId={comment._id} />
            </div>
          </>
        )}
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
        readOnly={readOnly}
      />
      <ReplyThreads
        replies={replies}
        taskId={taskId}
        users={users}
        repliesByParentId={repliesByParentId}
        onDeleteRequest={onDeleteRequest}
        depth={depth}
        readOnly={readOnly}
      />
    </div>
  );
}
