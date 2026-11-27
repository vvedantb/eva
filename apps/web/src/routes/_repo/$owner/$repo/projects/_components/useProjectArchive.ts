import { useState } from "react";
import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { archiveCopy, readableServerError } from "@eva/shared";
import { mutationError } from "@/lib/utils/mutationToast";
import { useRequestConfirm } from "@vvedantb/ui";
import { undoToast } from "@/lib/utils/undoToast";
import { useProjectUnarchive } from "@/lib/components/projects/useProjectUnarchive";
import type { ProjectArchiveTarget } from "./ProjectArchiveDialog";

interface PendingArchive {
  target: ProjectArchiveTarget;
  ids: Id<"projects">[];
}

export interface ProjectArchiveController {
  /** Non-null while the confirm dialog is open. */
  target: ProjectArchiveTarget | null;
  isArchiving: boolean;
  close: () => void;
  requestSingle: (id: Id<"projects">, title: string) => void;
  requestBulk: (ids: ReadonlyArray<Id<"projects">>) => void;
  confirm: () => Promise<void>;
}

/**
 * Archiving projects from the board — one card or a whole selection. Each
 * project archives with its tasks. Both paths confirm first (Alt skips it),
 * then the toast offers Undo. It refuses while a project task runs: the toast
 * shows its reason and the dialog stays.
 */
export function useProjectArchive(
  repoId: Id<"githubRepos">,
  onArchived: () => void,
): ProjectArchiveController {
  const archiveProject = useMutation(
    api.projects.archive,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(localStore, api.projects.list, { repoId }, (list) =>
      list.filter((p) => p._id !== args.id),
    );
  });
  const unarchive = useProjectUnarchive(repoId);
  const [pending, setPending] = useState<PendingArchive | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();

  const run = async (next: PendingArchive) => {
    setIsArchiving(true);
    const copy = archiveCopy("project", next.ids.length);
    const archived = await Promise.all(
      next.ids.map((id) => archiveProject({ id })),
    ).then(
      () => true,
      (error: Error) => {
        mutationError(
          readableServerError(error, copy.archiveFailed),
          "project-archive",
        );
        return false;
      },
    );
    setIsArchiving(false);
    if (!archived) return;
    undoToast(
      copy.archived,
      () => {
        void unarchive(next.ids);
      },
      { id: "project-archive" },
    );
    setPending(null);
    onArchived();
  };

  const request = (next: PendingArchive) => {
    requestConfirm(
      () => setPending(next),
      () => {
        void run(next);
      },
    );
  };

  return {
    target: pending?.target ?? null,
    isArchiving,
    close: () => setPending(null),
    requestSingle: (id, title) =>
      request({ target: { kind: "single", id, title }, ids: [id] }),
    requestBulk: (ids) =>
      request({ target: { kind: "bulk", count: ids.length }, ids: [...ids] }),
    confirm: async () => {
      if (pending) await run(pending);
    },
  };
}
