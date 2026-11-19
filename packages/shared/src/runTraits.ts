import type { ReasoningLevel, StoredModelTraits } from "@eva/backend";

/** The run-trait fields as they are stored on (and written to) a task, recap doc or project. */
interface RunTraitFields {
  reasoningLevel?: ReasoningLevel;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
}

/** Stored run traits in the shape the traits menu reads (web and phone). */
export function storedRunTraits(
  record: RunTraitFields | undefined | null,
): StoredModelTraits {
  return {
    effortLevel: record?.reasoningLevel,
    thinkingEnabled: record?.thinkingEnabled,
    use1mContext: record?.use1mContext,
    fastMode: record?.fastMode,
  };
}

/**
 * Menu traits in the shape the task mutations take — and `projects.setTraits`,
 * which takes the same four fields. Only set traits are included, so a
 * one-trait change writes (and optimistically patches) that trait alone and
 * leaves the rest of the record untouched.
 */
export function toRunTraitArgs(traits: StoredModelTraits): RunTraitFields {
  return {
    ...(traits.effortLevel !== undefined
      ? { reasoningLevel: traits.effortLevel }
      : {}),
    ...(traits.thinkingEnabled !== undefined
      ? { thinkingEnabled: traits.thinkingEnabled }
      : {}),
    ...(traits.use1mContext !== undefined
      ? { use1mContext: traits.use1mContext }
      : {}),
    ...(traits.fastMode !== undefined ? { fastMode: traits.fastMode } : {}),
  };
}
