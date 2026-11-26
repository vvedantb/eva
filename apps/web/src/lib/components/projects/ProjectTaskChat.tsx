"use client";

import type { Id } from "@eva/backend";
import { Spinner } from "@vvedantb/ui";
import { TaskSandboxChatPanel } from "@/lib/components/tasks/TaskSandboxChatPanel";
import { useTaskDetail } from "@/lib/components/tasks/useTaskDetail";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import { PROJECT_TASK_ROUTING } from "@/lib/components/tasks/useTaskDetailControls";
import { useProjectTaskExpand } from "./ProjectTaskPane";

/**
 * The selected task tab's own chat, in the project's chat column. An
 * archived task's chat is read-only. Files, a diff without a PR and Agents
 * open the task's full page; a diff with a PR shows the panel's Review.
 */
export function ProjectTaskChat({
  taskId,
  prUrl,
  fullPageHref,
  onShowReview,
}: {
  taskId: Id<"agentTasks">;
  /** The task's own PR. */
  prUrl: string | undefined;
  /** The task's full page (pre-internal form). */
  fullPageHref: string;
  onShowReview: () => void;
}) {
  const {
    isLoading,
    isArchived,
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    handleStartSandbox,
    handleStopSandbox,
  } = useTaskDetail(taskId, PROJECT_TASK_ROUTING);
  const { expand, openDiffs } = useProjectTaskExpand({
    fullPageHref,
    prUrl,
    onShowReview,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }
  return (
    <SandboxSurfaceProviders
      onOpenFile={(path) => expand({ file: path })}
      onOpenDiffsTab={openDiffs}
    >
      <TaskSandboxChatPanel
        taskId={taskId}
        isSandboxActive={isSandboxActive}
        isSandboxToggling={isSandboxStarting || isSandboxStopping}
        isSandboxStopping={isSandboxStopping}
        sandboxStartupActivity={sandboxStartupActivity}
        onOpenFile={(path) => expand({ file: path })}
        onViewDiff={(path) =>
          path === undefined ? openDiffs() : expand({ diffFile: path })
        }
        onOpenAgentsTab={() => expand()}
        isArchived={isArchived}
        onSandboxToggle={
          canStartSandbox || isSandboxActive
            ? (action) => {
                if (action === "start") void handleStartSandbox();
                else void handleStopSandbox();
              }
            : undefined
        }
      />
    </SandboxSurfaceProviders>
  );
}
