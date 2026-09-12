import type { ReasoningLevel } from "../validators";

/** Composer knobs that persist as last-* fields on session, project, and task. */
export type ComposerTraits = {
  reasoningLevel?: ReasoningLevel;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
};

export type ComposerTraitFields = {
  lastReasoningLevel?: ReasoningLevel;
  lastThinkingEnabled?: boolean;
  lastUse1mContext?: boolean;
  lastFastMode?: boolean;
};

/** Maps incoming composer knobs onto the last-* columns. Undefined means leave. */
export function composerTraitFields(
  traits: ComposerTraits,
): ComposerTraitFields {
  return {
    ...(traits.reasoningLevel !== undefined
      ? { lastReasoningLevel: traits.reasoningLevel }
      : {}),
    ...(traits.thinkingEnabled !== undefined
      ? { lastThinkingEnabled: traits.thinkingEnabled }
      : {}),
    ...(traits.use1mContext !== undefined
      ? { lastUse1mContext: traits.use1mContext }
      : {}),
    ...(traits.fastMode !== undefined ? { lastFastMode: traits.fastMode } : {}),
  };
}

/** True when at least one composer knob is present to persist. */
export function hasComposerTraitUpdate(traits: ComposerTraits): boolean {
  return (
    traits.reasoningLevel !== undefined ||
    traits.thinkingEnabled !== undefined ||
    traits.use1mContext !== undefined ||
    traits.fastMode !== undefined
  );
}
