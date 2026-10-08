"use client";

import { useQueryState } from "nuqs";
import { docModeParser, type DocMode } from "@/lib/search-params";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Button,
  CrossfadeIconSlot,
  cn,
} from "@eva/ui";
import { IconPencil, IconMessageDots, IconEye } from "@tabler/icons-react";

const MODE_CONFIG: Record<DocMode, { label: string; icon: typeof IconPencil }> =
  {
    editing: { label: "Editing", icon: IconPencil },
    suggesting: { label: "Suggesting", icon: IconMessageDots },
    viewing: { label: "Viewing", icon: IconEye },
  };

const DOC_MODES: readonly DocMode[] = ["editing", "suggesting", "viewing"];

export function DocModeSwitcher() {
  const [mode, setMode] = useQueryState("mode", docModeParser);

  const current = MODE_CONFIG[mode];
  const Icon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Mode: ${current.label}`}
        >
          <CrossfadeIconSlot
            iconKey={mode}
            className="relative flex size-3.5 items-center justify-center"
          >
            <Icon size={14} aria-hidden />
          </CrossfadeIconSlot>
          <span className="hidden sm:inline-grid">
            {DOC_MODES.map((docMode) => (
              <span
                key={docMode}
                className={cn(
                  "col-start-1 row-start-1",
                  docMode !== mode && "invisible",
                )}
              >
                {MODE_CONFIG[docMode].label}
              </span>
            ))}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {DOC_MODES.map((docMode) => {
          const config = MODE_CONFIG[docMode];
          const ModeIcon = config.icon;
          return (
            <DropdownMenuItem
              key={docMode}
              onClick={() => setMode(docMode)}
              className={docMode === mode ? "bg-accent" : undefined}
            >
              <ModeIcon size={16} />
              {config.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
