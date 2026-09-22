"use client";

import { Tooltip, TooltipContent, TooltipTrigger, motionFast } from "@eva/ui";
import { IconSparkles } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import type { SlashItem } from "@/lib/components/mentions";

/**
 * Skills Eva thinks fit the draft, offered as chips on the composer's top
 * edge. Picking one inserts the same `/skill` token the `/` picker would.
 */
export function SkillSuggestionChips({
  chips,
  onPick,
}: {
  chips: SlashItem[];
  onPick: (item: SlashItem) => void;
}) {
  if (chips.length === 0) return null;

  return (
    // Same inset as the stash dock, so the chips line up with the input card.
    <div className="mx-auto flex w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <Tooltip key={chip.id}>
            <TooltipTrigger asChild>
              <m.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={motionFast}
                onClick={() => onPick(chip)}
                aria-label={`Add /${chip.label} to your message`}
                className="max-sm:hit-target mb-2 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-muted"
              >
                <IconSparkles size={14} className="shrink-0 text-primary" />
                <span className="truncate">{chip.label}</span>
              </m.button>
            </TooltipTrigger>
            {chip.description ? (
              <TooltipContent className="max-w-64">
                {chip.description}
              </TooltipContent>
            ) : null}
          </Tooltip>
        ))}
      </AnimatePresence>
    </div>
  );
}
