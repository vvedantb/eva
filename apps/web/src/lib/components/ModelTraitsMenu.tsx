"use client";

import {
  getModelTraits,
  getReasoningLevelLabel,
  resolveTraitsForDisplay,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";
import { TraitsPanel, type ModelPickerTraits } from "@vvedantb/ui";

/**
 * Eva's stored traits as the UI package's trait controls for one model:
 * which traits the model supports, their shown values (stored, else the
 * model's defaults) and level labels. `ModelPicker` takes this as `traits`;
 * every picker goes through here so values and labels resolve the same way.
 */
export function modelPickerTraits(
  model: AIModel,
  traits: StoredModelTraits,
  onChange: (partial: StoredModelTraits) => void,
): ModelPickerTraits {
  const config = getModelTraits(model);
  const display = resolveTraitsForDisplay(model, traits);
  return {
    config,
    effortLevel: display.effortLevel,
    thinkingEnabled: display.thinkingEnabled,
    use1mContext: display.use1mContext,
    fastMode: display.fastMode,
    getLevelLabel: getReasoningLevelLabel,
    onEffortLevelChange: (level) => {
      // The panel hands back a plain string; match it against the model's own
      // levels to narrow it to a ReasoningLevel.
      const match = config.reasoning?.levels.find((entry) => entry === level);
      if (match) onChange({ effortLevel: match });
    },
    onThinkingEnabledChange: (thinkingEnabled) => onChange({ thinkingEnabled }),
    onUse1mContextChange: (use1mContext) => onChange({ use1mContext }),
    onFastModeChange: (fastMode) => onChange({ fastMode }),
  };
}

/**
 * The trait controls on their own, for menus that embed `ModelPickerContent`
 * rather than the `ModelPicker` button.
 */
export function ModelTraitsMenu({
  model,
  traits,
  onChange,
  disabled,
  className,
}: {
  model: AIModel;
  /** Stored traits; absent fields fall back to the model's own defaults. */
  traits: StoredModelTraits;
  /** Called with only the trait that changed. */
  onChange: (partial: StoredModelTraits) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <TraitsPanel
      {...modelPickerTraits(model, traits, onChange)}
      disabled={disabled}
      className={className}
    />
  );
}
