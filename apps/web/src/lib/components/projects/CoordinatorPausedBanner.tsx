"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { AnimatePresence, m } from "motion/react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { api, type Id } from "@eva/backend";
import { coordinatorPausedTitle } from "@eva/shared/projectView";
import { tokenTransition } from "@vvedantb/ui";

/**
 * The coordinator chat's "needs you" line while the hourly cap of automatic
 * turns holds its wake-ups back (`getCoordinatorState`). A person's message
 * releases them, so the line sits above the composer. Same frame as the usage-limit recovery card, in the needs-you
 * tone.
 */
export function CoordinatorPausedBanner({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const state = useQuery(api.projects.getCoordinatorState, { projectId });
  return (
    <AnimatePresence initial={false}>
      {state?.paused ? (
        <m.div
          key="coordinator-paused"
          className="mb-2 flex items-center gap-2.5 rounded-surface bg-muted p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={tokenTransition.fast}
        >
          <IconAlertTriangle size={18} className="shrink-0 text-warning" />
          <p className="min-w-0 text-sm font-medium">
            {coordinatorPausedTitle(state.maxAutoTurnsPerHour)}
          </p>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
