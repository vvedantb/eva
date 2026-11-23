"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { m } from "motion/react";
import { api, type Id } from "@eva/backend";
import {
  projectTaskView,
  unapprovedTodoTaskIds,
  type ProjectTaskNotes,
} from "@eva/shared/projectView";
import { Button, Surface, tokenTransition } from "@vvedantb/ui";
import { IconCheck } from "@tabler/icons-react";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { useRepo } from "@/lib/contexts/RepoContext";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { ProjectTaskRow } from "./_components/ProjectTaskRow";
import type { ProjectTaskListRow } from "./useProjectStatus";

/**
 * The tasks one coordinator call proposed (`projectTaskBatches`), live, in
 * the coordinator chat under the turn that proposed them. The rows are the
 * project task list's rows. A contributor approves the batch's unapproved
 * todo tasks with one Approve, or cancels a task on its row; a viewer reads
 * the card only. A click on a task opens it in the project's task pane.
 */
export function ProjectTaskBatchCard({
  projectId,
  projectNumId,
  homeRepoId,
  canContribute,
  tasks,
  failedTaskIds,
  notesByTask,
  reposById,
  onSelectTask,
}: {
  projectId: Id<"projects">;
  projectNumId: number | undefined;
  homeRepoId: Id<"githubRepos">;
  canContribute: boolean;
  /** The batch's tasks that still exist, in batch order. */
  tasks: readonly ProjectTaskListRow[];
  failedTaskIds: ReadonlySet<string>;
  notesByTask: ReadonlyMap<string, ProjectTaskNotes>;
  reposById: ReadonlyMap<string, RepoAppMarkRepo>;
  onSelectTask: (id: Id<"agentTasks">) => void;
}) {
  const { basePath } = useRepo();
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [isApproving, setIsApproving] = useState(false);
  const toApprove = canContribute ? unapprovedTodoTaskIds(tasks) : [];

  // Reset is duplicated into the catch instead of using `finally`: React
  // Compiler bails on the whole file when it meets a `finally` clause.
  const approve = async () => {
    const successMessage =
      toApprove.length === 1 ? "Task approved" : "Tasks approved";
    setIsApproving(true);
    try {
      await withMutationToast(
        approveTasks({ projectId, taskIds: toApprove }),
        successMessage,
        "Couldn't approve the tasks",
        "project-approve",
      );
    } catch {
      setIsApproving(false);
      return;
    }
    setIsApproving(false);
  };

  if (tasks.length === 0) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
    >
      <Surface density="tight" className="min-w-0 max-w-full">
        <div
          className="flex min-w-0 flex-col gap-3"
          data-testid="project-task-batch-card"
        >
          <p className="text-xs text-muted-foreground">Proposed tasks</p>
          <div className="flex min-w-0 flex-col gap-2">
            {tasks.map((task) => {
              const view = projectTaskView(task, failedTaskIds.has(task._id));
              return (
                <ProjectTaskRow
                  key={task._id}
                  task={task}
                  needsYou={view.needsYou}
                  waitingForCoordinator={view.waitingForCoordinator}
                  notes={notesByTask.get(task._id)}
                  hasError={failedTaskIds.has(task._id)}
                  selectedTaskId={null}
                  onSelectTask={onSelectTask}
                  basePath={basePath}
                  projectNumId={projectNumId}
                  homeRepoId={homeRepoId}
                  reposById={reposById}
                  canContribute={canContribute}
                />
              );
            })}
          </div>
          {toApprove.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isApproving}
                onClick={() => void approve()}
              >
                <IconCheck size={14} aria-hidden />
                Approve
              </Button>
            </div>
          ) : null}
        </div>
      </Surface>
    </m.div>
  );
}
