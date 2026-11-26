"use client";

import { UserProfileHoverCardBody } from "@eva/shared/user-initials";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@vvedantb/ui";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { MENTION_CHIP_CLASS, MENTION_CHIP_SELF_CLASS } from "./mentionChipStyles";

interface UserMentionChipProps {
  userId: string;
  label: string;
}

/** @mention pill with a Linear-style profile card on hover. */
export function UserMentionChip({ userId, label }: UserMentionChipProps) {
  const isMe = useQuery(api.auth.me) === userId;
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span
          className={`${isMe ? MENTION_CHIP_SELF_CLASS : MENTION_CHIP_CLASS} cursor-default`}
          tabIndex={0}
        >
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
