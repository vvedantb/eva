"use client";

import {
  findAIModelOption,
  getReasoningLevelLabel,
  resolveTraitsForDisplay,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";
import { Badge, formatModelDisplayLabel, ProviderIcon } from "@eva/ui";

/**
 * States which model and traits produced the recap on screen. Traits appear
 * only when they differ from the model's own defaults.
 */
export function RecapRunBadge({
  model,
  traits,
}: {
  model: AIModel;
  traits: StoredModelTraits;
}) {
  const option = findAIModelOption(model);
  const display = resolveTraitsForDisplay(model, traits);

  const chips: Array<string> = [];
  if (display.effortLevel) {
    chips.push(getReasoningLevelLabel(display.effortLevel));
  }
  if (display.use1mContext) chips.push("1M");
  if (display.fastMode) chips.push("Fast");
  if (!display.thinkingEnabled) chips.push("No thinking");

  return (
    <Badge variant="outline" className="gap-1 font-normal text-2xs">
      <ProviderIcon provider={option.provider} size={11} />
      {formatModelDisplayLabel(option.provider, option.label)}
      {chips.length > 0 ? (
        <span className="text-muted-foreground">· {chips.join(" · ")}</span>
      ) : null}
    </Badge>
  );
}
