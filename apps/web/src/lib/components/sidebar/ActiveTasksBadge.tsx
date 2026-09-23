"use client";

import { Badge, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";
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
  const allTasks = useQuery(api.agentTasks.getActiveTasks, { repoId });
  const sandboxTasks =
    allTasks?.filter(
      (t) =>
        !t.projectId &&
        (t.reviewTaskSandboxStatus === "active" ||
          t.reviewTaskSandboxStatus === "starting"),
    ) ?? [];

  return (
    <AnimatePresence>
      {sandboxTasks.length > 0 ? (
        <m.div
          key="active-tasks"
          className="ml-auto"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={motionFast}
        >
          <Badge
            variant="secondary"
            className="cursor-default items-center gap-2 border-none bg-sidebar-accent/50 px-1.5 py-0.5"
          >
            <CountPop
              label={countLabel(sandboxTasks.length)}
              className="flex items-center gap-1.5"
            >
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                {sandboxTasks.length}
              </span>
            </CountPop>
          </Badge>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
