"use client";

import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { archiveCopy } from "@eva/shared";
import { patchLoadedQuery } from "@vvedantb/server";
import { useMutation } from "convex/react";
import { useState } from "react";
import { ConfirmDialog } from "@vvedantb/ui";
import { undoToast } from "@/lib/utils/undoToast";
import { useRepo } from "@/lib/contexts/RepoContext";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

/**
 * Archives and unarchives quick tasks, one or a selection. Archive toasts
 * "Task archived" with an Undo, as a session archive does. Shared by the
 * confirm dialogs, the Alt-click bypass and the Unarchive menu items.
 */
export function useTaskArchive() {
  const { repoId } = useRepo();
  const archiveTask = useMutation(api.agentTasks.archive).withOptimisticUpdate(
    (localStore, args) => {
      patchLoadedQuery(localStore, api.agentTasks.getAllTasks, { repoId }, (cur) =>
        cur.filter((task) => task._id !== args.id),
      );
    },
  );
  const unarchiveTask = useMutation(
    api.agentTasks.unarchive,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(localStore, api.agentTasks.listArchived, { repoId }, (cur) =>
      cur.filter((task) => task._id !== args.id),
    );
  });

  const unarchive = (ids: ReadonlyArray<Id<"agentTasks">>) => {
    const copy = archiveCopy("task", ids.length);
    return Promise.all(ids.map((id) => unarchiveTask({ id }))).then(
      () => mutationSuccess(copy.unarchived, "task-unarchive"),
      () => mutationError(copy.unarchiveFailed, "task-unarchive"),
    );
  };
  const archive = (ids: ReadonlyArray<Id<"agentTasks">>) => {
    const copy = archiveCopy("task", ids.length);
    return Promise.all(ids.map((id) => archiveTask({ id }))).then(
      () => {
        undoToast(
          copy.archived,
          () => {
            void unarchive(ids);
          },
          { id: "task-archive" },
        );
        return true;
      },
      () => {
        mutationError(copy.archiveFailed, "task-archive");
        return false;
      },
    );
  };

  return { archive, unarchive };
}

interface ArchiveTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  taskId: Id<"agentTasks">;
  taskTitle: string;
}

export function ArchiveTaskDialog({
  open,
  onClose,
  onDone,
  taskId,
  taskTitle,
}: ArchiveTaskDialogProps) {
  const { archive } = useTaskArchive();
  const [isArchiving, setIsArchiving] = useState(false);

  const handleArchive = async () => {
    setIsArchiving(true);
    const archived = await archive([taskId]);
    setIsArchiving(false);
    if (!archived) return;
    onClose();
    if (onDone) onDone();
  };

  return (
    <ConfirmDialog
      size="md"
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={archiveCopy("task").confirmTitle}
      description={<strong>{taskTitle}</strong>}
      confirmLabel="Archive"
      onConfirm={handleArchive}
      pending={isArchiving}
    />
  );
}
