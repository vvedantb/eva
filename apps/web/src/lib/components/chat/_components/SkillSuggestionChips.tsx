"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  tokenTransition,
} from "@vvedantb/ui";
import { IconSparkles } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import type { SlashItem } from "@/lib/components/mentions";
import { COMPOSER_CHIP_CLASS } from "../composerChip";

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
  // No early return on zero chips: AnimatePresence must stay mounted to play
  // the last chip's exit. The row it sits in belongs to `ChatComposer`.
  return (
    <AnimatePresence initial={false}>
      {chips.map((chip) => (
        <Tooltip key={chip.id}>
          <TooltipTrigger asChild>
            <m.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={tokenTransition.fast}
              onClick={() => onPick(chip)}
              aria-label={`Add /${chip.label} to your message`}
              className={COMPOSER_CHIP_CLASS}
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
  );
}
