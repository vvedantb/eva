"use client";

import { Badge, tokenTransition, CountPop, countLabel } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";

interface ActiveTasksBadgeProps {
  repoId: Id<"githubRepos">;
}

/**
 * Count of quick tasks with a live sandbox. Deliberately just the number — no
 * hover card, and no separate in-progress count.
 */
export function ActiveTasksBadge({ repoId }: ActiveTasksBadgeProps) {
  const count = useQuery(api.agentTasks.countSandboxTasks, { repoId }) ?? 0;

  return (
    <AnimatePresence>
      {count > 0 ? (
        <m.div
          key="active-tasks"
          className="ml-auto"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={tokenTransition.fast}
        >
          <Badge
            variant="secondary"
            className="cursor-default items-center gap-2 border-none bg-sidebar-accent/50 px-1.5 py-0.5"
          >
            <CountPop
              label={countLabel(count)}
              className="flex items-center gap-1.5"
            >
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="text-2xs font-medium text-muted-foreground tabular-nums">
                {count}
              </span>
            </CountPop>
          </Badge>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
