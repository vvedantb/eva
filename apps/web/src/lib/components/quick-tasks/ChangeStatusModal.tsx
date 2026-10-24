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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vvedantb/ui";
import { withMutationToast } from "@/lib/utils/mutationToast";
import {
  type DisplayTaskStatus,
  statusConfig,
  TASK_STATUSES,
} from "../tasks/TaskStatusBadge";

type TaskStatus = DisplayTaskStatus;

interface ChangeStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: Set<Id<"agentTasks">>;
  onSuccess: () => void;
}

export function ChangeStatusModal({
  isOpen,
  onClose,
  selectedTaskIds,
  onSuccess,
}: ChangeStatusModalProps) {
  const { repoId } = useRepo();
  const updateStatus = useMutation(
    api.agentTasks.updateStatus,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.agentTasks.getAllTasks, { repoId });
    if (current !== undefined) {
      localStore.setQuery(
        api.agentTasks.getAllTasks,
        { repoId },
        current.map((task) =>
          task._id === args.id ? { ...task, status: args.status } : task,
        ),
      );
    }
  });
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | "">("");
  const [isLoading, setIsLoading] = useState(false);

  const count = selectedTaskIds.size;
  const taskIds = [...selectedTaskIds];

  const handleClose = () => {
    setSelectedStatus("");
    onClose();
  };

  const handleChangeStatus = async () => {
    if (!selectedStatus) return;
    setIsLoading(true);
    // Built out here: a ternary inside the `try` bails the React Compiler out
    // of this whole file. See CLAUDE.md.
    const successMessage = `Updated ${count} task${count === 1 ? "" : "s"}`;
    try {
      await withMutationToast(
        Promise.all(
          taskIds.map((id) => updateStatus({ id, status: selectedStatus })),
        ),
        successMessage,
        "Couldn't update status",
        "tasks-bulk-status",
      );
      setSelectedStatus("");
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
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Change status of {count} task{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            All selected tasks will be moved to the chosen status.
          </DialogDescription>
        </DialogHeader>
        <Select
          value={selectedStatus}
          onValueChange={(val) => {
            const found = TASK_STATUSES.find((s) => s === val);
            if (found) setSelectedStatus(found);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {statusConfig[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleChangeStatus}
            disabled={isLoading || !selectedStatus}
          >
            {isLoading && <Spinner size="sm" />}
            Change Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
