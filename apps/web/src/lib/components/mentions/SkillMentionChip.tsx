"use client";

import type { MouseEvent } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import { SKILL_CHIP_CLASS } from "./mentionChipStyles";
import { SkillMentionHoverCardBody } from "./SkillMentionHoverCardBody";

interface SkillMentionChipProps {
  skillId: Id<"repoSkills">;
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function SkillMentionChip({
  skillId,
  label,
  onClick,
}: SkillMentionChipProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={`${SKILL_CHIP_CLASS} cursor-pointer transition-[background-color] hover:bg-primary/20`}
        >
          /{label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        className="w-auto border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      >
        <SkillMentionHoverCardBody skillId={skillId} />
      </HoverCardContent>
    </HoverCard>
  );
}
