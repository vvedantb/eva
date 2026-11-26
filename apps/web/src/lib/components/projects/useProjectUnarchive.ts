import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { archiveCopy } from "@eva/shared";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

/**
 * Brings archived projects back with their tasks: the Archived list's
 * Unarchive, the project page's Unarchive and the archive toast's Undo.
 */
export function useProjectUnarchive(repoId: Id<"githubRepos"> | undefined) {
  const unarchiveProject = useMutation(
    api.projects.unarchive,
  ).withOptimisticUpdate((localStore, args) => {
    if (!repoId) return;
    patchLoadedQuery(localStore, api.projects.listArchived, { repoId }, (list) =>
      list.filter((p) => p._id !== args.id),
    );
  });

  return (ids: ReadonlyArray<Id<"projects">>) => {
    const copy = archiveCopy("project", ids.length);
    return Promise.all(ids.map((id) => unarchiveProject({ id }))).then(
      () => mutationSuccess(copy.unarchived, "project-unarchive"),
      () => mutationError(copy.unarchiveFailed, "project-unarchive"),
    );
  };
}
