import { useState } from "react";
import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { readableServerError } from "@eva/shared";
import {
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";
import {
  useRequestConfirm,
} from "@vvedantb/ui";
import type { ProjectDeleteTarget } from "./ProjectDeleteDialog";

interface PendingDelete {
  target: ProjectDeleteTarget;
  ids: Id<"projects">[];
}

export interface ProjectDeleteController {
  /** Non-null while the confirm dialog is open. */
  target: ProjectDeleteTarget | null;
  isDeleting: boolean;
  close: () => void;
  requestSingle: (id: Id<"projects">, title: string) => void;
  requestBulk: (ids: ReadonlyArray<Id<"projects">>) => void;
  confirm: () => Promise<void>;
}

/**
 * Deleting projects from the board — one card or a whole selection.
 *
 * `projects.remove` has no restore mutation, so both paths keep their
 * confirm dialog (Alt still skips it) and neither offers an Undo. It refuses
 * while a child task runs: the toast shows its reason and the dialog stays.
 */
export function useProjectDelete(
  onDeleted: () => void,
  /** The home repo, when the page shows one (its `projects.list` drops the row too). */
  repoId?: Id<"githubRepos">,
): ProjectDeleteController {
  const deleteProject = useMutation(
    api.projects.remove,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(localStore, api.projects.listAccessible, {}, (current) => ({
      ...current,
      projects: current.projects.filter((p) => p._id !== args.id),
    }));
    if (repoId === undefined) return;
    patchLoadedQuery(localStore, api.projects.list, { repoId }, (list) =>
      list.filter((p) => p._id !== args.id),
    );
  });
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();

  const run = async (next: PendingDelete) => {
    setIsDeleting(true);
    const count = next.ids.length;
    const isSingle = next.target.kind === "single";
    const success = isSingle
      ? "Project deleted"
      : `${count} project${count === 1 ? "" : "s"} deleted`;
    const failure = isSingle
      ? "Couldn't delete project"
      : "Couldn't delete projects";
    const toastId = isSingle ? "project-delete" : "projects-bulk-delete";
    const deleted = await Promise.all(
      next.ids.map((id) => deleteProject({ id })),
    ).then(
      () => true,
      (error: Error) => {
        mutationError(readableServerError(error, failure), toastId);
        return false;
      },
    );
    setIsDeleting(false);
    if (!deleted) return;
    mutationSuccess(success, toastId);
    setPending(null);
    onDeleted();
  };

  const request = (next: PendingDelete) => {
    requestConfirm(
      () => setPending(next),
      () => {
        void run(next);
      },
    );
  };

  return {
    target: pending?.target ?? null,
    isDeleting,
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
