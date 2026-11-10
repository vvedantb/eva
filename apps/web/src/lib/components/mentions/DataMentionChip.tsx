"use client";

import type { MouseEvent } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import { MENTION_CHIP_CLASS } from "./mentionChipStyles";
import { DataMentionHoverCardBody } from "./DataMentionHoverCardBody";

interface DataMentionChipProps {
  entityId: string;
  repoId: Id<"githubRepos">;
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

/** Clickable `@` chip for Data mentions (docs, sessions, projects, tasks). */
export function DataMentionChip({
  entityId,
  repoId,
  label,
  onClick,
}: DataMentionChipProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={`${MENTION_CHIP_CLASS} cursor-pointer transition-[background-color] hover:bg-primary/20`}
        >
          @{label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        className="w-auto border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      >
        <DataMentionHoverCardBody entityId={entityId} repoId={repoId} />
      </HoverCardContent>
    </HoverCard>
  );
}
