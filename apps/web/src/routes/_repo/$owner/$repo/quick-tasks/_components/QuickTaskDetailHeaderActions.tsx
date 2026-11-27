"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { EntityContextUsage } from "@/lib/components/context-usage";
import { QuickTaskHeaderActionsSlot } from "@/lib/components/quick-tasks/QuickTaskHeaderActionsSlot";

interface QuickTaskDetailHeaderActionsProps {
  repoId: Id<"githubRepos">;
  taskId: string;
  prevTaskId?: Id<"agentTasks">;
  nextTaskId?: Id<"agentTasks">;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
}

export function QuickTaskDetailHeaderActions({
  repoId,
  taskId,
  prevTaskId,
  nextTaskId,
  onNavigatePrev,
  onNavigateNext,
}: QuickTaskDetailHeaderActionsProps) {
  return (
    <div className="flex max-sm:min-w-0 max-sm:flex-wrap items-center max-sm:justify-end max-sm:gap-1.5 sm:gap-2">
      <EntityContextUsage repoId={repoId} entityId={taskId} />
      <QuickTaskHeaderActionsSlot />
      {/* Grown to the 40px floor below `sm` rather than given `hit-target`:
          the two buttons sit flush, so an 8px bleed each would overlap and one
          would steal the other's taps. */}
      <div className="flex max-sm:shrink-0 items-center gap-0.5 max-sm:gap-1">
        <button
          type="button"
          onClick={onNavigatePrev}
          disabled={!prevTaskId}
          className="max-sm:flex max-sm:size-10 max-sm:items-center max-sm:justify-center rounded p-1 transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Previous task"
          title="Previous task"
        >
          <IconChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={onNavigateNext}
          disabled={!nextTaskId}
          className="max-sm:flex max-sm:size-10 max-sm:items-center max-sm:justify-center rounded p-1 transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Next task"
          title="Next task"
        >
          <IconChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
