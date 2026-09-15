"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useState } from "react";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Spinner,
} from "@eva/ui";
import { withMutationToast } from "@/lib/utils/mutationToast";

/** Bulk-deletes selected quick tasks. Shared by the modal and Alt-click bypass. */
export function useBulkDeleteTasks() {
  const { repoId } = useRepo();
  const removeTask = useMutation(api.agentTasks.remove).withOptimisticUpdate(
    (localStore, args) => {
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
    },
  );

  return async (selectedTaskIds: Set<Id<"agentTasks">>) => {
    const count = selectedTaskIds.size;
    const successMessage = `Deleted ${count} task${count === 1 ? "" : "s"}`;
    await withMutationToast(
      Promise.all([...selectedTaskIds].map((id) => removeTask({ id }))),
      successMessage,
      "Couldn't delete tasks",
      "tasks-bulk-delete",
    );
  };
}

interface DeleteTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: Set<Id<"agentTasks">>;
  onSuccess: () => void;
}

export function DeleteTasksModal({
  isOpen,
  onClose,
  selectedTaskIds,
  onSuccess,
}: DeleteTasksModalProps) {
  const deleteSelected = useBulkDeleteTasks();
  const [isLoading, setIsLoading] = useState(false);

  const count = selectedTaskIds.size;

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await deleteSelected(selectedTaskIds);
      onSuccess();
      onClose();
    } catch {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Delete {count} task{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. The selected task
            {count === 1 ? "" : "s"} will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading}
          >
            {isLoading && <Spinner size="sm" />}
            Delete {count} task{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
