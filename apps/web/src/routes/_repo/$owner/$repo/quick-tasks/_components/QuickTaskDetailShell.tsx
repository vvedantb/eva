"use client";

import { type ReactNode } from "react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { Spinner } from "@eva/ui";
import { useQuickTaskNeighbors } from "../_utils/useQuickTaskNeighbors";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import {
  QuickTaskHeaderActionsSlotProvider,
  QuickTaskHeaderTitleSlot,
} from "@/lib/components/quick-tasks/QuickTaskHeaderActionsSlot";
import { QuickTaskBreadcrumb } from "./QuickTaskBreadcrumb";
import { QuickTaskDetailHeaderActions } from "./QuickTaskDetailHeaderActions";
import { useEntityDocumentTitle } from "@/lib/hooks/useDocumentTitle";

interface QuickTaskDetailShellProps {
  taskId: string;
  detailTab: TaskDetailTab;
  navSurface: "detail" | "sandbox";
  sandboxTab?: TaskRouteSandboxTab;
  children: ReactNode;
}

/** Shared page chrome for quick task detail and sandbox routes. */
export function QuickTaskDetailShell({
  taskId,
  navSurface,
  sandboxTab,
  children,
}: QuickTaskDetailShellProps) {
  const { repo } = useRepo();
  const {
    tasks,
    selectedTask,
    prevTaskId,
    nextTaskId,
    handleNavigatePrev,
    handleNavigateNext,
    handleBack,
  } = useQuickTaskNeighbors({ taskId, navSurface, sandboxTab });

  // Names the browser tab. Here rather than in the page contents: this shell
  // wraps both the detail and sandbox surfaces, so one call covers both.
  useEntityDocumentTitle(selectedTask?.title);

  if (tasks === undefined) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <QuickTaskHeaderActionsSlotProvider>
      <PageWrapper
        title={
          <QuickTaskBreadcrumb
            onBack={handleBack}
            taskId={taskId}
            tasks={tasks}
            taskNumId={selectedTask?.numId}
          />
        }
        titleAfter={<QuickTaskHeaderTitleSlot />}
        headerRight={
          <QuickTaskDetailHeaderActions
            repoId={repo._id}
            taskId={taskId}
            prevTaskId={prevTaskId ?? undefined}
            nextTaskId={nextTaskId ?? undefined}
            onNavigatePrev={handleNavigatePrev}
            onNavigateNext={handleNavigateNext}
          />
        }
        fillHeight
        childPadding={false}
      >
        {/* Detail keeps page gutters; sandbox is flush like sessions/projects. */}
        <div
          className={
            navSurface === "detail"
              ? "relative flex min-w-0 flex-1 min-h-0 flex-col overflow-hidden p-3 pt-0"
              : "relative flex min-w-0 flex-1 min-h-0 flex-col overflow-hidden"
          }
        >
          <div
            className={
              navSurface === "detail"
                ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden"
                : "flex min-h-0 w-full flex-1 flex-col overflow-hidden"
            }
          >
            {children}
          </div>
        </div>
      </PageWrapper>
    </QuickTaskHeaderActionsSlotProvider>
  );
}
