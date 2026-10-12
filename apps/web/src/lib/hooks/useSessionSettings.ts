"use client";

import {
  DEFAULT_AI_MODEL,
  buildTraitsExecutionPayload,
  normalizeAIModel,
  resolveTraitsForDisplay,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";

/**
 * Derives composer display/execution traits from Convex-backed sticky prefs.
 * Persistence lives on the session/design document — this hook does not touch
 * localStorage.
 */
export function useSessionSettings(overrides: {
  defaultModel?: string | null;
  model: AIModel;
  onModelChange?: (model: AIModel) => void;
  traits?: StoredModelTraits;
  onTraitsPersist?: (partial: Partial<StoredModelTraits>) => void;
  providerAccountId?: string | null;
}) {
  const model = normalizeAIModel(
    overrides.model ?? overrides.defaultModel ?? DEFAULT_AI_MODEL,
  );
  const providerAccountId = overrides.providerAccountId ?? null;
  const storedTraits: StoredModelTraits = {
    effortLevel: overrides.traits?.effortLevel,
    thinkingEnabled: overrides.traits?.thinkingEnabled,
    use1mContext: overrides.traits?.use1mContext,
    fastMode: overrides.traits?.fastMode,
  };

  const displayTraits = resolveTraitsForDisplay(model, storedTraits);
  const executionTraits = buildTraitsExecutionPayload(model, storedTraits);

  const setModel = (nextModel: AIModel) => {
    overrides.onModelChange?.(normalizeAIModel(nextModel));
  };

  const onTraitsChange = (partial: Partial<StoredModelTraits>) => {
    overrides.onTraitsPersist?.(partial);
  };

  return {
    model,
    storedTraits,
    displayTraits,
    executionTraits,
    onTraitsChange,
    providerAccountId,
    setModel,
  };
}
