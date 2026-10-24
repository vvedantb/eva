"use client";

import type { Id } from "@eva/backend";
import { AnimatePresence, m } from "motion/react";
import { QuickTaskTaskPageContent } from "./QuickTaskTaskPageContent";
import type { QuickTaskRouteState } from "../_utils/useQuickTaskRouteState";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import { transitionFast } from "@vvedantb/ui";

interface QuickTaskSplitDetailPaneProps {
  taskId: Id<"agentTasks">;
  detailTab: TaskDetailTab;
  sandboxTab?: TaskRouteSandboxTab;
  navSurface: "detail" | "sandbox";
}

/**
 * Right pane of the list-view master/detail split. Task chrome (surface
 * switcher, context usage, actions, prev/next) sits in
 * {@link QuickTaskSplitDetailHeader} directly above, so this pane is just the
 * shared task body.
 */
export function QuickTaskSplitDetailPane({
  taskId,
  detailTab,
  sandboxTab,
  navSurface,
}: QuickTaskSplitDetailPaneProps) {
  const routeState: QuickTaskRouteState =
    navSurface === "sandbox" && sandboxTab
      ? { surface: "sandbox", sandboxTab, detailTab: "activity" }
      : { surface: "detail", detailTab };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={taskId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFast}
      >
        <QuickTaskTaskPageContent taskId={taskId} routeState={routeState} />
      </m.div>
    </AnimatePresence>
  );
}
