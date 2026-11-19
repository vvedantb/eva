"use client";

import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast, ConfirmDialog } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";

/** Moves a quick task to another app. Shared by the confirm dialog and Alt-click bypass. */
export function useMoveAgentTask() {
  const { repoId } = useRepo();
  return useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      // Moving to a different repo — remove from the current repo's list
      if (args.repoId) {
        patchLoadedQuery(
          localStore,
          api.agentTasks.getAllTasks,
          { repoId },
          (cur) => cur.filter((task) => task._id !== args.id),
        );
      }
    },
  );
}

interface MoveTaskDialogProps {
  targetId: Id<"githubRepos"> | null;
  targetAppName: string;
  onClose: () => void;
  /** After a successful move, once the dialog has closed. */
  onDone?: () => void;
  taskId: Id<"agentTasks">;
  taskTitle: string;
}

export function MoveTaskDialog({
  targetId,
  targetAppName,
  onClose,
  onDone,
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
      if (onDone) onDone();
    } catch (err) {
      console.error("Failed to move task:", err);
      toast.error("Could not move the task. Try again.");
    }
    setIsMoving(false);
  };

  return (
    <ConfirmDialog
      size="md"
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
      body={
        <p className="text-sm text-muted-foreground">
          The task will appear in the other app's quick tasks.
        </p>
      }
      confirmLabel="Move"
      onConfirm={handleMove}
      pending={isMoving}
    />
  );
}
