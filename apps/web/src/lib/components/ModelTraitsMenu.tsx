"use client";

import {
  getModelTraits,
  getReasoningLevelLabel,
  resolveTraitsForDisplay,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";
import { TraitsPanel } from "@vvedantb/ui";

interface ModelTraitsMenuProps {
  model: AIModel;
  /** Stored traits; absent fields fall back to the model's own defaults. */
  traits: StoredModelTraits;
  /** Called with only the trait that changed. */
  onChange: (partial: StoredModelTraits) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Trait controls (reasoning / Speed / context window / thinking) for one
 * model. Renders the compact panel used inside the model picker — chat
 * composers, the quick task modal, and task Properties share this so stored
 * values, model defaults and labels resolve the same way everywhere.
 */
export function ModelTraitsMenu({
  model,
  traits,
  onChange,
  disabled,
  className,
}: ModelTraitsMenuProps) {
  const config = getModelTraits(model);
  const display = resolveTraitsForDisplay(model, traits);

  return (
    <TraitsPanel
      config={config}
      effortLevel={display.effortLevel}
      thinkingEnabled={display.thinkingEnabled}
      use1mContext={display.use1mContext}
      fastMode={display.fastMode}
      getLevelLabel={getReasoningLevelLabel}
      onEffortLevelChange={(level) => {
        // The menu hands back a plain string; match it against the model's own
        // levels to narrow it to a ReasoningLevel.
        const match = config.reasoning?.levels.find((entry) => entry === level);
        if (match) onChange({ effortLevel: match });
      }}
      onThinkingEnabledChange={(thinkingEnabled) =>
        onChange({ thinkingEnabled })
      }
      onUse1mContextChange={(use1mContext) => onChange({ use1mContext })}
      onFastModeChange={(fastMode) => onChange({ fastMode })}
      disabled={disabled}
      className={className}
    />
  );
}
