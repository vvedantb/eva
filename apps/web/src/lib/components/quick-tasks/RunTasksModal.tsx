"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useState } from "react";
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
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

/** Starts selected quick tasks. Shared by the modal and Alt-click bypass. */
export function useBulkRunTasks() {
  const startExecution = useMutation(api.agentTasks.startExecution);

  return async (
    selectedTaskIds: Set<Id<"agentTasks">>,
  ): Promise<{ startedCount: number; count: number }> => {
    const count = selectedTaskIds.size;
    const taskIds = [...selectedTaskIds];
    const results = await Promise.all(
      taskIds.map(async (id) => {
        try {
          await startExecution({ id });
          return true;
        } catch (err) {
          console.error(`Failed to start task ${id}:`, err);
          return false;
        }
      }),
    );
    return { startedCount: results.filter((started) => started).length, count };
  };
}

interface RunTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: Set<Id<"agentTasks">>;
  onSuccess: () => void;
}

export function RunTasksModal({
  isOpen,
  onClose,
  selectedTaskIds,
  onSuccess,
}: RunTasksModalProps) {
  const runSelected = useBulkRunTasks();
  const [isLoading, setIsLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const count = selectedTaskIds.size;

  const handleRun = async () => {
    setIsLoading(true);
    setRunError(null);
    // Built out here: a ternary inside the `try` bails the React Compiler out
    // of this whole file. See CLAUDE.md.
    const successMessage = `Started ${count} task${count === 1 ? "" : "s"}`;
    try {
      const { startedCount } = await runSelected(selectedTaskIds);
      if (startedCount === count) {
        mutationSuccess(successMessage, "tasks-bulk-run");
        setIsLoading(false);
        onSuccess();
        onClose();
        return;
      }
      if (startedCount === 0) {
        mutationError("Couldn't start tasks", "tasks-bulk-run");
        setRunError(
          "Failed to start any selected tasks. Check task state and try again.",
        );
      } else {
        setRunError(
          `Started ${startedCount} of ${count} tasks. ${count - startedCount} failed to start.`,
        );
      }
    } catch (err) {
      console.error("Failed to run tasks:", err);
      setRunError("Failed to run selected tasks.");
    }
    setIsLoading(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) {
          setRunError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Run {count} task{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            Eva will start working on the selected task
            {count === 1 ? "" : "s"} immediately.
          </DialogDescription>
        </DialogHeader>
        {runError && <p className="text-sm text-destructive">{runError}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleRun} disabled={isLoading}>
            {isLoading && <Spinner size="sm" />}
            Run {count} task{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
