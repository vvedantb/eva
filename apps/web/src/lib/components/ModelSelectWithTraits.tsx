"use client";

import {
  modelTraitSummary,
  SIMPLE_VIEW_MODEL_LADDER,
  snapToSimpleViewLadder,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";
import { ModelPicker } from "@vvedantb/ui";
import type { ModelPickerProps } from "@vvedantb/ui";
import { ModelTraitsMenu } from "@/lib/components/ModelTraitsMenu";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

type ModelSelectWithTraitsProps = Omit<
  ModelPickerProps<AIModel>,
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
          ...modelTraitSummary(value, traits),
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
    <ModelPicker
      {...selectProps}
      value={value}
      disabled={disabled}
      triggerSuffix={traitsUi?.suffix}
      showFastIcon={traitsUi?.fast}
      header={traitsUi?.header}
      simpleLadder={simpleView ? SIMPLE_VIEW_MODEL_LADDER : undefined}
      simpleLadderSnap={simpleView ? snapToSimpleViewLadder(value) : undefined}
    />
  );
}
