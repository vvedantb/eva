import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { requestConfirm, useAltHeld } from "@/lib/confirm";
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
 * `deleteCascade` also soft-deletes the project's tasks and there is no restore
 * mutation, so both paths keep their confirm dialog (Alt still skips it) and
 * neither offers an Undo.
 */
export function useProjectDelete(
  repoId: Id<"githubRepos">,
  onDeleted: () => void,
): ProjectDeleteController {
  const deleteProject = useMutation(
    api.projects.deleteCascade,
  ).withOptimisticUpdate((localStore, args) => {
    const currentList = localStore.getQuery(api.projects.list, { repoId });
    if (currentList !== undefined) {
      localStore.setQuery(
        api.projects.list,
        { repoId },
        currentList.filter((p) => p._id !== args.id),
      );
    }
  });
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const altHeld = useAltHeld();

  const run = async (next: PendingDelete) => {
    setIsDeleting(true);
    // Built out here: a ternary inside the `try` bails the React Compiler out
    // of this whole file. See CLAUDE.md.
    const count = next.ids.length;
    const isSingle = next.target.kind === "single";
    const success = isSingle
      ? "Project deleted"
      : `${count} project${count === 1 ? "" : "s"} deleted`;
    const failure = isSingle
      ? "Couldn't delete project"
      : "Couldn't delete projects";
    const toastId = isSingle ? "project-delete" : "projects-bulk-delete";
    try {
      await withMutationToast(
        Promise.all(next.ids.map((id) => deleteProject({ id }))),
        success,
        failure,
        toastId,
      );
      setPending(null);
      onDeleted();
    } catch {
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
  };

  const request = (next: PendingDelete) => {
    requestConfirm(
      altHeld,
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
