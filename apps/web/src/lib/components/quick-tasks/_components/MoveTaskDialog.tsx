"use client";

import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "@eva/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { ConfirmDialog } from "./ConfirmDialog";

/** Moves a quick task to another app. Shared by the confirm dialog and Alt-click bypass. */
export function useMoveAgentTask() {
  const { repoId } = useRepo();
  return useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      // Moving to a different repo — remove from the current repo's list
      if (args.repoId) {
        const current = localStore.getQuery(api.agentTasks.getAllTasks, {
          repoId,
        });
        if (current !== undefined) {
          localStore.setQuery(
            api.agentTasks.getAllTasks,
            { repoId },
            current.filter((task) => task._id !== args.id),
          );
        }
      }
    },
  );
}

interface MoveTaskDialogProps {
  targetId: Id<"githubRepos"> | null;
  targetAppName: string;
  onClose: () => void;
  taskId: Id<"agentTasks">;
  taskTitle: string;
}

export function MoveTaskDialog({
  targetId,
  targetAppName,
  onClose,
  taskId,
  taskTitle,
}: MoveTaskDialogProps) {
  const updateTask = useMoveAgentTask();
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = async () => {
    if (!targetId) return;
    setIsMoving(true);
    try {
      await updateTask({ id: taskId, repoId: targetId });
      onClose();
    } catch (err) {
      console.error("Failed to move task:", err);
      toast.error("Could not move the task. Try again.");
    }
    setIsMoving(false);
  };

  return (
    <ConfirmDialog
      open={targetId !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Move Task"
      description={
        <>
          Move <strong>{taskTitle}</strong> to <strong>{targetAppName}</strong>?
        </>
      }
      detail="The task will appear in the other app's quick tasks."
      confirmLabel="Move"
      onConfirm={handleMove}
      isLoading={isMoving}
    />
  );
}
