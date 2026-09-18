"use client";

import {
  normalizeAIModel,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { Button, CrossfadeIcon, Spinner } from "@eva/ui";
import { IconRefresh } from "@tabler/icons-react";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { useAvailableAiModels } from "@/lib/hooks/useAvailableAiModels";

interface RecapGenerateControlsProps {
  repoId: Id<"githubRepos">;
  model: AIModel;
  onModelChange: (model: AIModel) => void;
  traits: StoredModelTraits;
  onTraitsChange: (partial: StoredModelTraits) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  label: string;
  variant?: "default" | "ghost";
}

/**
 * Model picker (traits live in the same menu) and Generate button for a PR
 * recap. Mounted in both the empty state and the panel toolbar so a recap can
 * be regenerated on a different model without leaving the tab.
 */
export function RecapGenerateControls({
  repoId,
  model,
  onModelChange,
  traits,
  onTraitsChange,
  onGenerate,
  isGenerating,
  disabled,
  label,
  variant = "default",
}: RecapGenerateControlsProps) {
  const { options } = useAvailableAiModels(repoId, model);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      <ModelSelectWithTraits
        value={model}
        options={options}
        onValueChange={(next) => onModelChange(normalizeAIModel(next))}
        traits={traits}
        onTraitsChange={onTraitsChange}
        disabled={disabled}
        className="px-0"
      />
      <Button
        size="sm"
        variant={variant}
        className={variant === "ghost" ? "h-7 px-2" : undefined}
        onClick={onGenerate}
        disabled={disabled || isGenerating}
      >
        <CrossfadeIcon
          show={isGenerating}
          trueKey="loading"
          falseKey="idle"
          variant="soft"
          className="relative flex size-3.5 items-center justify-center"
          whenTrue={<Spinner size="sm" />}
          whenFalse={<IconRefresh size={14} />}
        />
        {label}
      </Button>
    </div>
  );
}
