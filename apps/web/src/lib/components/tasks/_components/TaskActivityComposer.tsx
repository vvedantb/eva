"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { CommentMentionInput } from "./CommentMentionInput";
import { CommentSendButton } from "./CommentSendButton";
import { TaskActivityComposerForm } from "./TaskActivityComposerForm";

interface TaskActivityComposerProps {
  taskId: Id<"agentTasks">;
}

/** Comment input pinned below the task activity timeline. */
export function TaskActivityComposer({ taskId }: TaskActivityComposerProps) {
  const draft = useQuery(api.drafts.getForTarget, {
    target: { kind: "taskComment", taskId },
  });

  const editorClassName =
    "min-h-14 max-h-44 rounded-none border-0 bg-transparent px-3.5 py-3 shadow-none focus-visible:ring-0 transition-[background-color]";

  if (draft === undefined) {
    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-surface border border-input bg-card">
          <CommentMentionInput
            value=""
            onValueChange={() => undefined}
            placeholder="Add a comment..."
            disabled
            className={editorClassName}
          />
          <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5">
            <CommentSendButton
              size="icon-sm"
              disabled
              isSubmitting={false}
              onClick={() => undefined}
              ariaLabel="Add comment"
              quietWhenDisabled
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <TaskActivityComposerForm
      key="ready"
      taskId={taskId}
      initialContent={draft}
    />
  );
}
