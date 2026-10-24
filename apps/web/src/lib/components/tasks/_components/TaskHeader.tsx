"use client";

import { useState } from "react";
import { Input } from "@vvedantb/ui";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { taskTextLockReason } from "./task-detail-constants";

export function TaskHeader({
  taskNumber,
  title,
  canEditTaskText,
  hasActiveRun,
  taskId,
}: {
  taskNumber: number | undefined;
  title: string | undefined;
  canEditTaskText: boolean;
  hasActiveRun: boolean;
  taskId: Id<"agentTasks">;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      const cached = localStore.getQuery(api.agentTasks.get, { id: taskId });
      if (cached) {
        const {
          id: _id,
          priority,
          projectId,
          assignedTo,
          providerAccountId,
          ...safeFields
        } = args;
        localStore.setQuery(
          api.agentTasks.get,
          { id: taskId },
          {
            ...cached,
            ...safeFields,
            ...(priority !== undefined
              ? { priority: priority ?? undefined }
              : {}),
            ...(projectId !== undefined
              ? { projectId: projectId ?? undefined }
              : {}),
            ...(assignedTo !== undefined
              ? { assignedTo: assignedTo ?? undefined }
              : {}),
            ...(providerAccountId !== undefined
              ? { providerAccountId: providerAccountId ?? undefined }
              : {}),
          },
        );
      }
    },
  );

  return (
    <div className="flex max-sm:min-w-0 items-center gap-2">
      {taskNumber && (
        <span className="max-sm:shrink-0 font-mono tabular-nums text-muted-foreground">
          #{taskNumber}
        </span>
      )}
      {isEditingTitle ? (
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => {
            const trimmed = editTitle.trim();
            if (canEditTaskText && trimmed && trimmed !== title) {
              void catchMutationError(
                updateTask({ id: taskId, title: trimmed }),
                "Couldn't save title",
                "task-title-save",
              );
            }
            setIsEditingTitle(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setIsEditingTitle(false);
            }
          }}
          autoFocus
          className="flex-1 text-xl font-semibold h-auto px-1 -mx-1 py-0 border-none shadow-none focus-visible:ring-0 bg-muted/50 rounded"
        />
      ) : canEditTaskText ? (
        // A real button, not a `<span onClick>`: the title is plain text with
        // nothing clickable inside it, so there is no reason to hand-roll the
        // keyboard handling a native control already has.
        <button
          type="button"
          onClick={() => {
            setEditTitle(title ?? "");
            setIsEditingTitle(true);
          }}
          className="-mx-1 max-sm:min-w-0 rounded px-1 text-left text-xl font-semibold max-sm:wrap-break-word hover:bg-muted/50"
        >
          {title}
        </button>
      ) : (
        <span
          title={taskTextLockReason(hasActiveRun, "Title")}
          className="max-sm:min-w-0 text-xl font-semibold max-sm:wrap-break-word"
        >
          {title}
        </span>
      )}
    </div>
  );
}
