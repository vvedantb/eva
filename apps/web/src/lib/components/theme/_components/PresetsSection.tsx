"use client";

import type { CustomTheme } from "@/lib/contexts/ThemeContext";
import { cn } from "@eva/ui";
import { IconCheck } from "@tabler/icons-react";
import { ListEnter } from "@/lib/components/ui/ListEnter";

interface Preset {
  name: string;
  theme: Required<CustomTheme>;
  previewColor: string;
}

const PRESETS: Preset[] = [
  {
    name: "Default",
    theme: {
      accentColor: "zinc",
      fontFamily: "inter",
      radius: "xl",
      letterSpacing: "tight",
    },
    previewColor: "#18181B",
  },
  {
    name: "Modern",
    theme: {
      accentColor: "blue",
      fontFamily: "inter",
      radius: "xl",
      letterSpacing: "tight",
    },
    previewColor: "#2563EB",
  },
  {
    name: "Formal",
    theme: {
      accentColor: "orange",
      fontFamily: "source-serif",
      radius: "md",
      letterSpacing: "normal",
    },
    previewColor: "#EA580C",
  },
  {
    name: "Cool",
    theme: {
      accentColor: "green",
      fontFamily: "jakarta",
      radius: "lg",
      letterSpacing: "normal",
    },
    previewColor: "#15803D",
  },
];

function isPresetActive(
  preset: Required<CustomTheme>,
  current: Required<CustomTheme>,
): boolean {
  return (
    preset.accentColor === current.accentColor &&
    preset.fontFamily === current.fontFamily &&
    preset.radius === current.radius &&
    preset.letterSpacing === current.letterSpacing
  );
}

export function PresetsSection({
  currentTheme,
  onApplyPreset,
}: {
  currentTheme: Required<CustomTheme>;
  onApplyPreset: (theme: Required<CustomTheme>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {PRESETS.map((preset, index) => {
        const active = isPresetActive(preset.theme, currentTheme);

        return (
          <ListEnter
            key={preset.name}
            index={index}
            fast
            slide={false}
            staggerMax={8}
            className="h-full"
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onApplyPreset(preset.theme)}
              className={cn(
                // Matches the other theme pickers: border carries the selected
                // state, inactive keeps a transparent one to avoid reflow.
                "relative flex h-full w-full flex-col items-center gap-2 rounded-surface border p-3 text-xs font-medium transition-[background-color,border-color,color] sm:gap-3 sm:p-4 sm:text-sm",
                active
                  ? "border-border bg-primary/8 text-primary"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <IconCheck size={10} strokeWidth={3} />
                </span>
              )}
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: preset.previewColor }}
              />
              {preset.name}
            </button>
          </ListEnter>
        );
      })}
    </div>
  );
}
