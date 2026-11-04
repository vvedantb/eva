"use client";

import type { AIModel, StoredModelTraits } from "@eva/backend";
import type { useAvailableAiModels } from "@/lib/hooks/useAvailableAiModels";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { SettingsField } from "@vvedantb/ui";

type ModelFieldState = Pick<
  ReturnType<typeof useAvailableAiModels>,
  "model" | "options"
>;

export function ConfigModelField({
  label,
  description,
  disabled,
  state,
  traits,
  onValueChange,
  onTraitsChange,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  state: ModelFieldState;
  traits: StoredModelTraits;
  onValueChange: (model: AIModel) => void;
  onTraitsChange: (partial: StoredModelTraits) => void;
}) {
  return (
    <SettingsField label={label} description={description}>
      <ModelSelectWithTraits
        value={state.model}
        options={state.options}
        disabled={disabled}
        onValueChange={onValueChange}
        traits={traits}
        onTraitsChange={onTraitsChange}
        className="h-9 min-w-0 w-full rounded-control border border-input px-3.5 text-sm font-normal text-foreground hover:bg-muted hover:text-foreground"
      />
    </SettingsField>
  );
}
