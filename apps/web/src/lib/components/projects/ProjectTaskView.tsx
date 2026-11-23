"use client";

import type { Id } from "@eva/backend";
import { Spinner } from "@vvedantb/ui";
import { IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { TaskDetailInline } from "@/lib/components/tasks/TaskDetailInline";
import type { EntityResolveStatus } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { useProjectTaskStatus } from "./useProjectStatus";

/**
 * One project task in place of the coordinator: a back link to the
 * coordinator's Tasks tab, then the task's own chat and sandbox (the quick
 * task's sandbox view, `TaskDetailInline` in `project-task` mode). No
 * properties column. A task of another project, or one the reader cannot
 * open, is not found.
 */
export function ProjectTaskView({
  projectId,
  repoId,
  projectNumId,
  coordinatorHref,
  taskId,
  taskStatus,
}: {
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  projectNumId: number | undefined;
  /** The coordinator's Tasks tab (pre-internal form). */
  coordinatorHref: string;
  taskId: Id<"agentTasks"> | undefined;
  taskStatus: EntityResolveStatus | undefined;
}) {
  const navigate = useNavigate();
  const { tasks } = useProjectTaskStatus(projectId, repoId);
  const task = tasks?.find((row) => row._id === taskId && row.locked !== true);

  if (taskStatus === "loading" || (taskId !== undefined && !tasks)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!task) {
    return (
      <EntityNotFound
        entityLabel="task"
        backTo={coordinatorHref}
        backLabel="Back to tasks"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2 md:px-4">
        <DynamicLink
          to={toInternalRepoHref(coordinatorHref)}
          aria-label="Back to tasks"
          className="max-sm:hit-target flex shrink-0 items-center text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft size={16} />
        </DynamicLink>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <EntityNumLabel numId={task.taskNumber} projectNumId={projectNumId} />
          <span className="truncate text-sm font-medium text-foreground">
            {task.title}
          </span>
        </div>
      </div>
      <TaskDetailInline
        key={task._id}
        taskId={task._id}
        onClose={() =>
          void navigate({ to: toInternalRepoHref(coordinatorHref) })
        }
        routing={{ mode: "project-task" }}
      />
    </div>
  );
}
