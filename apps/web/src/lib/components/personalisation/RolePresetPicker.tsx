"use client";

import { PERSONALISATION_PRESETS } from "@eva/backend";
import { cn } from "@eva/ui";
import { IconBriefcase, IconCode, IconBrush } from "@tabler/icons-react";
import { ListEnter } from "@/lib/components/ui/ListEnter";

const PRESET_ICONS = {
  business: IconBriefcase,
  dev: IconCode,
  designer: IconBrush,
} as const;

const PRESET_KEYS = ["business", "dev", "designer"] as const;

export type RolePresetKey = (typeof PRESET_KEYS)[number];

interface RolePresetPickerProps {
  activeRole: RolePresetKey | null;
  onSelect: (role: RolePresetKey | null) => void;
}

export function RolePresetPicker({
  activeRole,
  onSelect,
}: RolePresetPickerProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {PRESET_KEYS.map((key, index) => {
        const preset = PERSONALISATION_PRESETS[key];
        const Icon = PRESET_ICONS[key];
        const isActive = activeRole === key;

        return (
          <ListEnter key={key} index={index} fast slide={false} className="h-full">
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(isActive ? null : key)}
              className={cn(
                // Inactive tiles keep a transparent border so selecting one does
                // not shift the grid.
                "h-full w-full cursor-pointer rounded-surface border p-3 text-left transition-[background-color,border-color]",
                isActive
                  ? "border-border bg-accent text-accent-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon size={14} />
                <span className="text-xs font-medium">{preset.label}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed opacity-80">
                {preset.description}
              </p>
            </button>
          </ListEnter>
        );
      })}
    </div>
  );
}
