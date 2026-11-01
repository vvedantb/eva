"use client";

import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast, ConfirmDialog } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";

/** Deletes a quick task. Shared by the confirm dialog and Alt-click bypass. */
export function useDeleteAgentTask() {
  const { repoId } = useRepo();
  return useMutation(api.agentTasks.deleteCascade).withOptimisticUpdate(
    (localStore, args) => {
      patchLoadedQuery(localStore, api.agentTasks.getAllTasks, { repoId }, (cur) =>
        cur.filter((task) => task._id !== args.id),
      );
    },
  );
}

interface DeleteTaskDialogProps {
  open: boolean;
  onClose: () => void;
  taskId: Id<"agentTasks">;
  taskTitle: string;
}

export function DeleteTaskDialog({
  open,
  onClose,
  taskId,
  taskTitle,
}: DeleteTaskDialogProps) {
  const deleteTask = useDeleteAgentTask();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteTask({ id: taskId });
      onClose();
    } catch (err) {
      console.error("Failed to delete task:", err);
      toast.error("Could not delete the task. Try again.");
    }
    setIsDeleting(false);
  };

  return (
    <ConfirmDialog
      size="md"
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Delete Task"
      description={
        <>
          Are you sure you want to delete <strong>{taskTitle}</strong>?
        </>
      }
      body={
        <p className="text-sm text-muted-foreground">
          This action cannot be undone.
        </p>
      }
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={handleDelete}
      pending={isDeleting}
    />
  );
}
