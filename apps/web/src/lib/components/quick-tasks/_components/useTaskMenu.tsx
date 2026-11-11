"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";
import { toast, useRequestConfirm } from "@vvedantb/ui";
import {
  DeleteTaskDialog,
  useDeleteAgentTask,
} from "./DeleteTaskDialog";
import { MoveTaskDialog, useMoveAgentTask } from "./MoveTaskDialog";
import type {
  GroupedCodebase,
  TaskCardMenuItemsProps,
} from "./TaskCardMenuItems";

type TaskMenuArgs = Omit<
  TaskCardMenuItemsProps,
  "variant" | "onDelete" | "onMove"
> & {
  /** After a delete or move takes the task off this page (the task header). */
  onRemoved?: () => void;
};

/** "codebase/app" for monorepos, the codebase name for single-app repos. */
function moveTargetName(
  targetId: Id<"githubRepos"> | null,
  groupedCodebases: GroupedCodebase[] | undefined,
): string {
  if (!targetId || !groupedCodebases) return "";
  for (const codebase of groupedCodebases) {
    const app = codebase.apps.find((a) => a._id === targetId);
    if (app) {
      return codebase.isMonorepo
        ? `${codebase.displayName}/${app.appName}`
        : codebase.displayName;
    }
  }
  return "";
}

/**
 * Props for `TaskCardMenuItems` plus the Delete and Move confirm dialogs. The
 * dialogs render beside the menu, not in it: Radix unmounts menu content on
 * close. Shared by the task card and the task header.
 */
export function useTaskMenu({ onRemoved, ...args }: TaskMenuArgs) {
  const { id, title, groupedCodebases } = args;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Id<"githubRepos"> | null>(null);
  const { request: requestConfirm } = useRequestConfirm();
  const deleteTask = useDeleteAgentTask();
  const moveTask = useMoveAgentTask();

  const menuProps = {
    ...args,
    onDelete: () =>
      requestConfirm(
        () => setShowDeleteConfirm(true),
        () => {
          deleteTask({ id }).then(onRemoved, (err: unknown) => {
            console.error("Failed to delete task:", err);
            toast.error("Could not delete the task. Try again.");
          });
        },
      ),
    onMove: (targetId: Id<"githubRepos">) =>
      requestConfirm(
        () => setMoveTarget(targetId),
        () => {
          moveTask({ id, repoId: targetId }).then(onRemoved, (err: unknown) => {
            console.error("Failed to move task:", err);
            toast.error("Could not move the task. Try again.");
          });
        },
      ),
  };

  const dialogs = (
    <>
      <DeleteTaskDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onDone={onRemoved}
        taskId={id}
        taskTitle={title}
      />
      <MoveTaskDialog
        targetId={moveTarget}
        targetAppName={moveTargetName(moveTarget, groupedCodebases)}
        onClose={() => setMoveTarget(null)}
        onDone={onRemoved}
        taskId={id}
        taskTitle={title}
      />
    </>
  );

  return {
    menuProps,
    dialogs,
    hasDialogOpen: showDeleteConfirm || moveTarget !== null,
  };
}
