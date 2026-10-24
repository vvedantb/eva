"use client";

import {
  getModelTraits,
  getReasoningLevelLabel,
  resolveTraitsForDisplay,
  SIMPLE_VIEW_MODEL_LADDER,
  snapToSimpleViewLadder,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";
import { ModelSelect } from "@vvedantb/ui";
import type { ModelSelectProps } from "@vvedantb/ui";
import { ModelTraitsMenu } from "@/lib/components/ModelTraitsMenu";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

function triggerTraitUi(
  model: AIModel,
  traits: StoredModelTraits,
): { suffix: string | undefined; showFastIcon: boolean } {
  const config = getModelTraits(model);
  const display = resolveTraitsForDisplay(model, traits);
  const parts: string[] = [];
  if (config.reasoning) {
    parts.push(
      getReasoningLevelLabel(display.effortLevel ?? config.reasoning.default),
    );
  }
  if (config.contextWindow1m && display.use1mContext) {
    parts.push("1M");
  }
  if (config.thinkingToggle && !display.thinkingEnabled) {
    parts.push("No thinking");
  }
  return {
    suffix: parts.length > 0 ? parts.join(" · ") : undefined,
    showFastIcon: Boolean(config.fastMode && display.fastMode),
  };
}

type ModelSelectWithTraitsProps = Omit<
  ModelSelectProps<AIModel>,
  | "header"
  | "triggerSuffix"
  | "showFastIcon"
  | "simpleLadder"
  | "simpleLadderSnap"
> & {
  traits?: StoredModelTraits;
  onTraitsChange?: (partial: StoredModelTraits) => void;
};

/**
 * One trigger for model + traits. Simple view opens a 5-step slider;
 * Advanced (and the normal UI) lists models. Capable models also show
 * trait pills above the list so switching either is one menu.
 */
export function ModelSelectWithTraits({
  value,
  traits,
  onTraitsChange,
  disabled,
  ...selectProps
}: ModelSelectWithTraitsProps) {
  // Simple view keeps the model name only — no reasoning/context/fast controls
  // and no trailing trait summary on the trigger.
  const simpleView = useSimpleView();
  const traitsUi =
    !simpleView && onTraitsChange !== undefined && traits !== undefined
      ? {
          ...triggerTraitUi(value, traits),
          header: (
            <ModelTraitsMenu
              model={value}
              traits={traits}
              onChange={onTraitsChange}
              disabled={disabled}
            />
          ),
        }
      : undefined;

  return (
    <ModelSelect
      {...selectProps}
      value={value}
      disabled={disabled}
      triggerSuffix={traitsUi?.suffix}
      showFastIcon={traitsUi?.showFastIcon}
      header={traitsUi?.header}
      simpleLadder={simpleView ? SIMPLE_VIEW_MODEL_LADDER : undefined}
      simpleLadderSnap={simpleView ? snapToSimpleViewLadder(value) : undefined}
    />
  );
}
