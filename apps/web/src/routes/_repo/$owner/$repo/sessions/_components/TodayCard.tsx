"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { needsMeLabel } from "@eva/shared";
import { Button, Surface } from "@vvedantb/ui";
import { AwaitingAnswerMark } from "@/lib/components/ui/AwaitingAnswerMark";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

/**
 * Landing-composer pointer to Today, shown while an item of mine waits on my
 * answer. Same query as the sidebar's Today dot, so both clear together when
 * the user answers. No dismiss: answering is what clears it.
 */
export function TodayCard() {
  const { repoId, basePath } = useRepo();
  const count = useQuery(api.today.needsMeCount, { repoId }) ?? 0;
  if (count === 0) return null;

  return (
    <Surface density="tight" className="flex items-center gap-3">
      {/* The sidebar's "waiting for your answer" mark: the card says the same thing. */}
      <AwaitingAnswerMark className="shrink-0" />
      <p className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums text-foreground">
        {needsMeLabel(count)}
      </p>
      <Button asChild size="sm" variant="secondary" className="shrink-0">
        <Link to={toInternalRepoHref(`${basePath}/today`)}>Open Today</Link>
      </Button>
    </Surface>
  );
}
