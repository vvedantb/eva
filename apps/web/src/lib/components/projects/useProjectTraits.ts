"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id, ReasoningLevel, StoredModelTraits } from "@eva/backend";
import {
  composerTraitFields,
  storedComposerTraits,
  type ComposerTraitFields,
} from "@eva/shared";
import { toRunTraitArgs } from "@/lib/utils/runTraits";

/**
 * Project traits in the shape the traits menu reads. A project has one trait
 * set (`last*`), shared by the sandbox chat composer and the Overview model
 * row, so the two surfaces cannot show different reasoning or context.
 */
export function projectStoredTraits(
  project: ComposerTraitFields<ReasoningLevel> | undefined | null,
): StoredModelTraits {
  return storedComposerTraits(project);
}

/**
 * `projects.setTraits` with an optimistic patch of `projects.get`, so a trait
 * pick shows in the menu without waiting for the round trip.
 */
export function useSetProjectTraits(projectId: Id<"projects">) {
  const setTraits = useMutation(api.projects.setTraits).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.projects.get, { id: projectId });
      if (current === undefined || current === null) return;
      localStore.setQuery(
        api.projects.get,
        { id: projectId },
        {
          ...current,
          ...composerTraitFields(args),
        },
      );
    },
  );

  return (partial: StoredModelTraits) => {
    void setTraits({ id: projectId, ...toRunTraitArgs(partial) });
  };
}
