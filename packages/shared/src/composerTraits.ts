/** Composer knobs as the mutations accept them. Undefined means leave. */
export type ComposerTraits<TReasoningLevel = string> = {
  reasoningLevel?: TReasoningLevel;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
};

/** Sticky last-* columns on session, project, and task. */
export type ComposerTraitFields<TReasoningLevel = string> = {
  lastReasoningLevel?: TReasoningLevel;
  lastThinkingEnabled?: boolean;
  lastUse1mContext?: boolean;
  lastFastMode?: boolean;
};

/** Menu-shaped traits (`effortLevel` is the persisted reasoning knob). */
export type StoredComposerTraits<TReasoningLevel = string> = {
  effortLevel?: TReasoningLevel;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
};

/** Maps incoming composer knobs onto the last-* columns. */
export function composerTraitFields<TReasoningLevel = string>(
  traits: ComposerTraits<TReasoningLevel>,
): ComposerTraitFields<TReasoningLevel> {
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
export function hasComposerTraitUpdate<TReasoningLevel = string>(
  traits: ComposerTraits<TReasoningLevel>,
): boolean {
  return (
    traits.reasoningLevel !== undefined ||
    traits.thinkingEnabled !== undefined ||
    traits.use1mContext !== undefined ||
    traits.fastMode !== undefined
  );
}

/** Maps persisted last-* columns onto the traits menu shape. */
export function storedComposerTraits<TReasoningLevel = string>(
  fields: ComposerTraitFields<TReasoningLevel> | null | undefined,
): StoredComposerTraits<TReasoningLevel> {
  return {
    effortLevel: fields?.lastReasoningLevel,
    thinkingEnabled: fields?.lastThinkingEnabled,
    use1mContext: fields?.lastUse1mContext,
    fastMode: fields?.lastFastMode,
  };
}
