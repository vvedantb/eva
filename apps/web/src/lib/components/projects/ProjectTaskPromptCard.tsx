"use client";

import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { projectTaskPromptAction } from "@eva/shared/projectView";
import { Button, Surface } from "@vvedantb/ui";
import { TaskHeader } from "@/lib/components/tasks/_components/TaskHeader";
import { TaskDescription } from "@/lib/components/tasks/_components/TaskDescription";
import { TaskAttachments } from "@/lib/components/tasks/_components/TaskAttachments";
import { TaskReactionsProvider } from "@/lib/components/tasks/_components/TaskReactionsProvider";
import { useTaskDetail } from "@/lib/components/tasks/useTaskDetail";
import { PROJECT_TASK_ROUTING } from "@/lib/components/tasks/useTaskDetailControls";
import { withMutationToast } from "@/lib/utils/mutationToast";

/**
 * A project task's chat before its first run (`showsProjectTaskPrompt`): its
 * title, prompt and attachments, which edit in place as on the quick task
 * page (`canEditTaskText`), then Approve in Triage or Start once approved
 * (`projectTaskPromptAction`). Once the task runs, its prompt is the chat's
 * first message instead.
 */
export function ProjectTaskPromptCard({
  taskId,
}: {
  taskId: Id<"agentTasks">;
}) {
  const {
    task,
    hasActiveRun,
    isArchived,
    canEditTaskText,
    isStarting,
    executionError,
    handleStartExecution,
  } = useTaskDetail(taskId, PROJECT_TASK_ROUTING);
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  if (!task) return null;
  const { projectId } = task;
  const action = projectTaskPromptAction(task, {
    hasActiveRun,
    readOnly: isArchived,
  });
  const approve = () => {
    if (projectId === undefined) return;
    void withMutationToast(
      approveTasks({ projectId, taskIds: [taskId] }),
      "Task approved",
      "Couldn't approve the task",
      "project-approve",
    ).catch(() => undefined);
  };

  return (
    <TaskReactionsProvider taskId={taskId}>
      <Surface density="tight" className="min-w-0 max-w-full">
        <div className="flex min-w-0 flex-col gap-3">
          <TaskHeader
            taskNumber={undefined}
            title={task.title}
            canEditTaskText={canEditTaskText}
            hasActiveRun={hasActiveRun}
            taskId={taskId}
          />
          <TaskDescription
            description={task.description}
            canEditTaskText={canEditTaskText}
            hasActiveRun={hasActiveRun}
            taskId={taskId}
            inline={true}
          />
          <TaskAttachments taskId={taskId} readOnly={isArchived} />
          {executionError !== null ? (
            <p role="alert" className="text-xs text-destructive">
              {executionError}
            </p>
          ) : null}
          {action === undefined ? null : (
            <div className="flex min-w-0 items-center gap-2">
              {action === "approve" ? (
                <Button type="button" size="sm" onClick={approve}>
                  Approve
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={isStarting}
                  onClick={() => void handleStartExecution()}
                >
                  Start
                </Button>
              )}
            </div>
          )}
        </div>
      </Surface>
    </TaskReactionsProvider>
  );
}
