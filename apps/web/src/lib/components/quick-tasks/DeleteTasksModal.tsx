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
  toast,
} from "@eva/ui";
import {
  catchMutationError,
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";

/** Bulk-deletes selected quick tasks. Shared by the modal and Alt-click bypass. */
export function useBulkDeleteTasks() {
  const { repoId } = useRepo();
  const restoreTask = useMutation(api.agentTasks.restore);
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
    const ids = [...selectedTaskIds];
    const noun = `task${ids.length === 1 ? "" : "s"}`;
    await catchMutationError(
      Promise.all(ids.map((id) => removeTask({ id }))),
      "Couldn't delete tasks",
      "tasks-bulk-delete",
    );
    // Delete is a soft delete, so the way back is one mutation per row. The
    // sandbox and the scheduled run do not come back — `restore` says so.
    toast.success(`${ids.length} ${noun} deleted`, {
      id: "tasks-bulk-delete",
      action: {
        label: "Undo",
        onClick: () => {
          void Promise.all(ids.map((id) => restoreTask({ id })))
            .then(() => {
              mutationSuccess(`${ids.length} ${noun} restored`, "tasks-bulk-restore");
            })
            .catch(() => {
              mutationError("Couldn't restore tasks", "tasks-bulk-restore");
            });
        },
      },
    });
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
            The selected task{count === 1 ? "" : "s"} will be removed from every
            list. Undo is offered once, in the toast that follows; the sandbox
            and any scheduled run are gone either way.
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
