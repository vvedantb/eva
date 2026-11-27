"use client";

import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { compactRelativeTime } from "@eva/shared/dates";
import { isInternalAppHref } from "@eva/shared/safeUrl";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@vvedantb/ui";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";

const MENTION_LIMIT = 8;

/**
 * Past @mentions of you, newest first. Mounts only while the card is open, so
 * the feed (`notifications.list` History: read and archived rows too) is
 * subscribed on hover and not for the life of the rail.
 */
function MentionsList({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const feed = useQuery(api.notifications.list, { history: true });
  const mentions = feed
    ?.filter((n) => n.type === "mention")
    .slice(0, MENTION_LIMIT);

  if (mentions === undefined) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }
  if (mentions.length === 0) {
    return <p className="text-xs text-muted-foreground">No mentions yet</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {mentions.map((mention) => {
        const href = mention.href;
        return (
          <li key={mention._id}>
            <button
              type="button"
              disabled={href === undefined || !isInternalAppHref(href)}
              onClick={() => {
                if (href === undefined || !isInternalAppHref(href)) return;
                onNavigate();
                navigate(hrefToNavigateOptions(href));
              }}
              className="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-segment disabled:cursor-default"
            >
              <span className="flex min-w-0 items-baseline justify-between gap-2">
                <span data-pii className="truncate text-xs font-medium text-foreground">
                  {mention.title}
                </span>
                <span className="shrink-0 text-3xs text-muted-foreground">
                  {compactRelativeTime(mention.createdAt)}
                </span>
              </span>
              {mention.message ?? mention.contextLabel ? (
                <span data-pii className="line-clamp-2 text-xs text-muted-foreground">
                  {mention.message ?? mention.contextLabel}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Hover card on the rail's Inbox tile that lists the people who @mentioned you. */
export function RailMentionsHoverCard({
  onNavigate,
  children,
}: {
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" sideOffset={8} className="w-72 p-2">
        <p className="px-2 pb-1 text-xs font-medium text-foreground">Mentions</p>
        <MentionsList onNavigate={onNavigate} />
      </HoverCardContent>
    </HoverCard>
  );
}
