"use client";

import { UserProfileHoverCardBody } from "@eva/shared/user-initials";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@eva/ui";
import { MENTION_CHIP_CLASS } from "./mentionChipStyles";

interface UserMentionChipProps {
  /** Convex user id from an `@[label](id)` mention token. */
  userId: string;
  label: string;
}

/** @mention pill with a Linear-style profile card on hover. */
export function UserMentionChip({ userId, label }: UserMentionChipProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className={`${MENTION_CHIP_CLASS} cursor-default`} tabIndex={0}>
          @{label}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        className="w-72 border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      >
        <UserProfileHoverCardBody userId={userId} />
      </HoverCardContent>
    </HoverCard>
  );
}
