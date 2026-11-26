"use client";

import type { Id } from "@eva/backend";
import { archiveCopy } from "@eva/shared";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Spinner,
} from "@vvedantb/ui";
import { useTaskArchive } from "@/lib/components/quick-tasks/_components/ArchiveTaskDialog";

interface ArchiveTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: Set<Id<"agentTasks">>;
  onSuccess: () => void;
}

/** Confirms archiving the selected quick tasks; the toast offers Undo. */
export function ArchiveTasksModal({
  isOpen,
  onClose,
  selectedTaskIds,
  onSuccess,
}: ArchiveTasksModalProps) {
  const { archive } = useTaskArchive();
  const [isLoading, setIsLoading] = useState(false);

  const count = selectedTaskIds.size;

  const handleArchive = async () => {
    setIsLoading(true);
    const archived = await archive([...selectedTaskIds]);
    setIsLoading(false);
    if (!archived) return;
    onSuccess();
    onClose();
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
          <DialogTitle>{archiveCopy("task", count).confirmTitle}</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleArchive} disabled={isLoading}>
            {isLoading && <Spinner size="sm" />}
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
