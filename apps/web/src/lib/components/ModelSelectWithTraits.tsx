"use client";

import {
  SIMPLE_VIEW_MODEL_LADDER,
  snapToSimpleViewLadder,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";
import { ModelPicker } from "@vvedantb/ui";
import type { ModelPickerProps } from "@vvedantb/ui";
import { modelPickerTraits } from "@/lib/components/ModelTraitsMenu";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

type ModelSelectWithTraitsProps = Omit<
  ModelPickerProps<AIModel>,
  "traits" | "simpleLadder" | "simpleLadderSnap"
> & {
  traits: StoredModelTraits;
  onTraitsChange: (partial: StoredModelTraits) => void;
};

/**
 * Eva's model picker: the UI package's `ModelPicker` fed with Eva's model
 * traits. Simple view opens a 5-step slider and hides the traits; otherwise
 * the picker shows trait controls above the list and a summary on the trigger.
 */
export function ModelSelectWithTraits({
  value,
  traits,
  onTraitsChange,
  ...selectProps
}: ModelSelectWithTraitsProps) {
  const simpleView = useSimpleView();
  return (
    <ModelPicker
      {...selectProps}
      value={value}
      traits={simpleView ? null : modelPickerTraits(value, traits, onTraitsChange)}
      simpleLadder={simpleView ? SIMPLE_VIEW_MODEL_LADDER : undefined}
      simpleLadderSnap={simpleView ? snapToSimpleViewLadder(value) : undefined}
    />
  );
}
