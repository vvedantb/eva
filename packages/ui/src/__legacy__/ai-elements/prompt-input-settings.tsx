"use client";

import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../ui/dropdown-menu";
import { cn } from "../utils/cn";
import { IconDots } from "@tabler/icons-react";
import { ProviderIcon } from "./provider-icon";
import {
  type ModelOption,
  findModelOption,
  getProviderLabel,
} from "./model-picker";

function getProviderOptions<TModel extends string>(
  options: ReadonlyArray<ModelOption<TModel>>,
): ReadonlyArray<{ id: string; label: string }> {
  const providers: Array<{ id: string; label: string }> = [];
  for (const option of options) {
    if (providers.some((provider) => provider.id === option.provider)) {
      continue;
    }
    providers.push({
      id: option.provider,
      label: getProviderLabel(option.provider),
    });
  }
  return providers;
}

function getProviderModels<TModel extends string>(
  options: ReadonlyArray<ModelOption<TModel>>,
  provider: string,
): ReadonlyArray<ModelOption<TModel>> {
  return options.filter((option) => option.provider === provider);
}

export interface PromptInputSettingsProps<TModel extends string = string> {
  model: TModel;
  onModelChange: (model: TModel) => void;
  options: ReadonlyArray<ModelOption<TModel>>;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function PromptInputSettings<TModel extends string>({
  model,
  onModelChange,
  options,
  disabled,
  icon,
  className,
}: PromptInputSettingsProps<TModel>) {
  const selectedModel = findModelOption(model, options);
  const providerOptions = getProviderOptions(options);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            // The composer's overflow trigger had no transition at all, while
            // every other control in the same footer row presses.
            "motion-press rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.92] disabled:opacity-50",
            className,
          )}
          disabled={disabled}
        >
          {icon ?? <IconDots size={16} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ProviderIcon
              provider={selectedModel?.provider ?? "claude"}
              size={14}
            />
            Model
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {providerOptions.map((provider) => {
              const models = getProviderModels(options, provider.id);
              if (providerOptions.length === 1) {
                return (
                  <DropdownMenuRadioGroup
                    key={provider.id}
                    value={selectedModel?.id}
                    onValueChange={(nextValue) => {
                      const option = options.find(
                        (entry) => entry.id === nextValue,
                      );
                      if (option) {
                        onModelChange(option.id);
                      }
                    }}
                  >
                    {models.map((option) => (
                      <DropdownMenuRadioItem key={option.id} value={option.id}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                );
              }
              return (
                <DropdownMenuSub key={provider.id}>
                  <DropdownMenuSubTrigger>
                    <ProviderIcon provider={provider.id} size={14} />
                    {provider.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={selectedModel?.id}
                      onValueChange={(nextValue) => {
                        const option = options.find(
                          (entry) => entry.id === nextValue,
                        );
                        if (option) {
                          onModelChange(option.id);
                        }
                      }}
                    >
                      {models.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.id}
                          value={option.id}
                        >
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
