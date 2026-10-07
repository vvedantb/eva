"use client";

import { useOptionalPromptInputController } from "./prompt-input";
import { cn } from "../utils/cn";

const ULTRATHINK_PROMPT_PREFIX = "Ultrathink:\n";

export function isUltrathinkPrompt(text: string | null | undefined): boolean {
  return typeof text === "string" && /\bultrathink\b/i.test(text);
}

export function applyUltrathinkPrefix(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return ULTRATHINK_PROMPT_PREFIX;
  }
  if (trimmed.startsWith("Ultrathink:")) {
    return trimmed;
  }
  return `${ULTRATHINK_PROMPT_PREFIX}${trimmed}`;
}

export interface TraitsReasoningConfig {
  levels: ReadonlyArray<string>;
  default: string;
  ultrathink?: boolean;
}

export interface TraitsMenuConfig {
  reasoning?: TraitsReasoningConfig;
  thinkingToggle?: boolean;
  contextWindow1m?: boolean;
  contextWindowDefaultLabel?: string;
  fastMode?: boolean;
}

export interface TraitsMenuProps {
  config: TraitsMenuConfig;
  effortLevel: string | undefined;
  thinkingEnabled: boolean;
  use1mContext: boolean;
  fastMode: boolean;
  getLevelLabel: (level: string) => string;
  onEffortLevelChange: (level: string) => void;
  onThinkingEnabledChange: (enabled: boolean) => void;
  onUse1mContextChange: (use1m: boolean) => void;
  onFastModeChange: (enabled: boolean) => void;
  disabled?: boolean;
  className?: string;
}

interface TraitOption {
  value: string;
  label: string;
}

function TraitSegment({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<TraitOption>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-[4.75rem] shrink-0 pt-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {options.length === 0 ? (
        <span className="flex h-6 items-center text-[11px] text-muted-foreground/70">
          No options available
        </span>
      ) : (
        <div
          className="flex min-w-0 flex-1 flex-wrap gap-0.5"
          role="radiogroup"
          aria-label={label}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChange(option.value)}
                className={cn(
                  "h-6 rounded-md px-2 text-[11px] font-medium motion-press transition-colors active:scale-[0.96]",
                  selected
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Compact trait controls for embedding in the model picker. Every section
 * stays mounted so switching models cannot collapse the header; unsupported
 * traits show a muted empty state.
 */
export function TraitsPanel({
  config,
  effortLevel,
  thinkingEnabled,
  use1mContext,
  fastMode,
  getLevelLabel,
  onEffortLevelChange,
  onThinkingEnabledChange,
  onUse1mContextChange,
  onFastModeChange,
  disabled,
  className,
}: TraitsMenuProps) {
  const controller = useOptionalPromptInputController();
  const prompt = controller?.textInput.value ?? "";

  const ultrathinkAvailable =
    Boolean(config.reasoning?.ultrathink) && controller !== null;
  const ultrathinkPromptControlled =
    ultrathinkAvailable && isUltrathinkPrompt(prompt);
  const ultrathinkInBodyText =
    ultrathinkPromptControlled &&
    isUltrathinkPrompt(prompt.replace(/^Ultrathink:\s*/i, ""));

  const resolvedEffort = effortLevel ?? config.reasoning?.default ?? "";
  const contextDefaultLabel = config.contextWindowDefaultLabel ?? "200K";

  const handleEffortChange = (value: string) => {
    if (!value || !config.reasoning) return;

    if (value === "ultrathink") {
      if (!controller) return;
      const nextPrompt =
        prompt.trim().length === 0
          ? ULTRATHINK_PROMPT_PREFIX
          : applyUltrathinkPrefix(prompt);
      controller.textInput.setInput(nextPrompt);
      return;
    }

    if (ultrathinkInBodyText) return;

    if (ultrathinkPromptControlled && controller) {
      controller.textInput.setInput(prompt.replace(/^Ultrathink:\s*/i, ""));
    }

    onEffortLevelChange(value);
  };

  const effortRadioValue = ultrathinkPromptControlled
    ? "ultrathink"
    : resolvedEffort;

  const reasoningOptions: TraitOption[] = config.reasoning
    ? [
        ...config.reasoning.levels.map((level) => ({
          value: level,
          label: getLevelLabel(level),
        })),
        ...(ultrathinkAvailable
          ? [{ value: "ultrathink", label: "Ultrathink" }]
          : []),
      ]
    : [];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex min-h-6 flex-col gap-1">
        <TraitSegment
          label="Reasoning"
          value={effortRadioValue}
          options={reasoningOptions}
          onChange={handleEffortChange}
          disabled={disabled || ultrathinkInBodyText}
        />
        {ultrathinkInBodyText ? (
          <p className="pl-[5.375rem] text-[11px] leading-snug text-muted-foreground/80">
            Your prompt contains &quot;ultrathink&quot; in the text. Remove it
            to change this option.
          </p>
        ) : null}
      </div>
      <TraitSegment
        label="Speed"
        value={fastMode ? "fast" : "standard"}
        options={
          config.fastMode
            ? [
                { value: "standard", label: "Standard" },
                { value: "fast", label: "Fast" },
              ]
            : []
        }
        onChange={(value) => onFastModeChange(value === "fast")}
        disabled={disabled}
      />
      <TraitSegment
        label="Context"
        value={use1mContext ? "1m" : "standard"}
        options={
          config.contextWindow1m
            ? [
                { value: "standard", label: contextDefaultLabel },
                { value: "1m", label: "1M" },
              ]
            : []
        }
        onChange={(value) => onUse1mContextChange(value === "1m")}
        disabled={disabled}
      />
      <TraitSegment
        label="Thinking"
        value={thinkingEnabled ? "on" : "off"}
        options={
          config.thinkingToggle
            ? [
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]
            : []
        }
        onChange={(value) => onThinkingEnabledChange(value === "on")}
        disabled={disabled}
      />
    </div>
  );
}
