"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";
import { toast, useRequestConfirm } from "@vvedantb/ui";
import { ArchiveTaskDialog, useTaskArchive } from "./ArchiveTaskDialog";
import { MoveTaskDialog, useMoveAgentTask } from "./MoveTaskDialog";
import type {
  GroupedCodebase,
  TaskCardMenuItemsProps,
} from "./TaskCardMenuItems";

type TaskMenuArgs = Omit<
  TaskCardMenuItemsProps,
  "variant" | "onArchive" | "onUnarchive" | "onMove"
> & {  onRemoved?: () => void;
};

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
 * Props for `TaskCardMenuItems` plus the Archive and Move confirm dialogs. The
 * dialogs render beside the menu, not in it: Radix unmounts menu content on
 * close. Shared by the task card and the task header.
 */
export function useTaskMenu({ onRemoved, ...args }: TaskMenuArgs) {
  const { id, title, groupedCodebases } = args;
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Id<"githubRepos"> | null>(null);
  const { request: requestConfirm } = useRequestConfirm();
  const { archive, unarchive } = useTaskArchive();
  const moveTask = useMoveAgentTask();

  const menuProps = {
    ...args,
    onArchive: () =>
      requestConfirm(
        () => setShowArchiveConfirm(true),
        () => {
          void archive([id]).then((archived) => {
            if (archived && onRemoved) onRemoved();
          });
        },
      ),
    onUnarchive: () => {
      void unarchive([id]);
    },
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
      <ArchiveTaskDialog
        open={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
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
    hasDialogOpen: showArchiveConfirm || moveTarget !== null,
  };
}
