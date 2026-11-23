"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { standupEntryHeading } from "@eva/shared";
import { Button, Surface } from "@vvedantb/ui";
import { IconSunrise, IconX } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

/**
 * Landing-composer pointer to Today, shown while a Daily standup is unread.
 * Same query as the sidebar's Today dot, so both clear together when the user
 * opens Today or dismisses the card.
 */
export function TodayStandupCard() {
  const { repoId, basePath } = useRepo();
  const status = useQuery(api.today.standupStatus, { repoId });
  const markRead = useMutation(api.today.markStandupsRead);
  const unreadAt = status?.unreadAt ?? null;
  if (unreadAt === null) return null;

  return (
    <Surface density="tight" className="flex items-center gap-3">
      <IconSunrise size={18} className="shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        New standup · {standupEntryHeading(unreadAt)}
      </p>
      <Button asChild size="sm" variant="secondary" className="shrink-0">
        <Link to={toInternalRepoHref(`${basePath}/today`)}>Open Today</Link>
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        className="shrink-0"
        onClick={() => void markRead({ repoId })}
        aria-label="Dismiss standup"
      >
        <IconX size={14} />
      </Button>
    </Surface>
  );
}
