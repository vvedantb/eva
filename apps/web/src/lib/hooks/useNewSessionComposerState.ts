"use client";

import { useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { z } from "zod";
import {
  buildTraitsExecutionPayload,
  normalizeAIModel,
  resolveTraitsForDisplay,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";

// Older blobs also held model/traits/account; only the draft is read now.
const storedDraftSchema = z.object({ draft: z.string() }).catch({ draft: "" });

export function parseStoredDraft(raw: string): { draft: string } {
  try {
    return storedDraftSchema.parse(JSON.parse(raw));
  } catch {
    return { draft: "" };
  }
}

function storageKey(repoId: Id<"githubRepos">) {
  return `eva:new-session-composer:${repoId}`;
}

/**
 * Landing composer state (no session row yet). Only the prompt draft persists
 * in localStorage; model and traits start from the repo defaults on every
 * visit, like quick tasks.
 */
export function useNewSessionComposerState(
  repoId: Id<"githubRepos">,
  defaultModel: AIModel,
  defaultTraits: StoredModelTraits,
) {
  const [stored, setStored] = useLocalStorage(
    storageKey(repoId),
    { draft: "" },
    { deserializer: parseStoredDraft },
  );
  // Unpicked fields follow the repo defaults live.
  const [pickedModel, setPickedModel] = useState<AIModel | null>(null);
  const [pickedTraits, setPickedTraits] = useState<Partial<StoredModelTraits>>(
    {},
  );

  const model = pickedModel ?? defaultModel;
  const storedTraits: StoredModelTraits = { ...defaultTraits, ...pickedTraits };

  return {
    draft: stored.draft,
    model,
    displayTraits: resolveTraitsForDisplay(model, storedTraits),
    executionTraits: buildTraitsExecutionPayload(model, storedTraits),
    setDraft: (draft: string) => {
      setStored({ draft });
    },
    setModel: (nextModel: AIModel) => {
      setPickedModel(normalizeAIModel(nextModel));
    },
    onTraitsChange: (partial: Partial<StoredModelTraits>) => {
      setPickedTraits((prev) => ({ ...prev, ...partial }));
    },
    clearDraft: () => {
      setStored({ draft: "" });
    },
  };
}
