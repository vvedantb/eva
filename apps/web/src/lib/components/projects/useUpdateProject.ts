"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";

/**
 * `projects.update` with an optimistic patch of `projects.get`, so field edits
 * land instantly wherever a project is shown.
 *
 * Nullable args (priority, leads, model, provider account) mean "clear" on the
 * wire but `undefined` in the document, so they cannot ride the plain spread —
 * each is mapped back to `undefined` here.
 */
export function useUpdateProject(projectId: Id<"projects">) {
  return useMutation(api.projects.update).withOptimisticUpdate(
    (localStore, args) => {
      const {
        id: _id,
        priority,
        projectLead,
        codeReviewer,
        model,
        providerAccountId,
        ...safeFields
      } = args;
      patchLoadedQuery(
        localStore,
        api.projects.get,
        { id: projectId },
        (current) =>
          current && {
            ...current,
            ...safeFields,
            ...(priority !== undefined
              ? { priority: priority ?? undefined }
              : {}),
            ...(projectLead !== undefined
              ? { projectLead: projectLead ?? undefined }
              : {}),
            ...(codeReviewer !== undefined
              ? { codeReviewer: codeReviewer ?? undefined }
              : {}),
            ...(model !== undefined ? { model: model ?? undefined } : {}),
            ...(providerAccountId !== undefined
              ? { providerAccountId: providerAccountId ?? undefined }
              : {}),
          },
      );
    },
  );
}
