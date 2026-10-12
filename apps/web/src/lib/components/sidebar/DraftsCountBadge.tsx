"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";

interface DraftsCountBadgeProps {
  repoId: Id<"githubRepos">;
}

/**
 * Drafts accumulate in the background — a comment saved on a diff, a task left
 * unsent — so this pill appears and its number climbs while the user is
 * elsewhere in the app. `CountPop` gives it the same entrance as the rail's
 * unread dots, which used to be the only badge in the sidebar that moved.
 *
 * `Badge` is not used: it wraps its own `<div>`, and the pop needs to own the
 * element it animates so `mode="popLayout"` can take the outgoing one out of
 * flow. The classes below are `Badge variant="secondary"`'s, minus its border.
 */
export function DraftsCountBadge({ repoId }: DraftsCountBadgeProps) {
  const commentDrafts = useQuery(api.drafts.listForRepo, { repoId });
  const taskDraftCount = useQuery(api.agentTasks.countDrafts, { repoId });

  const count = (commentDrafts?.length ?? 0) + (taskDraftCount ?? 0);

  return (
    <CountPop
      label={countLabel(count)}
      className="ml-auto inline-flex items-center rounded-md bg-sidebar-accent/50 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
    />
  );
}
