"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id } from "@eva/backend";
import { projectStatusCountsLine } from "@eva/shared/projectView";
import { Button } from "@vvedantb/ui";
import { IconPlus } from "@tabler/icons-react";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { ProjectProgressBar } from "./ProjectProgressBar";
import { ProjectTaskListPanel } from "./ProjectTaskListPanel";
import { useProjectTaskStatus } from "./useProjectStatus";

/**
 * The coordinator rail's Tasks tab: the title with "+" (Eva's tab with her
 * composer focused, `onAskEva`), a thin progress bar
 * and the counts as one muted line, then the tasks grouped Needs you,
 * Working, Idle, Archived (with the tasks archived on their own), and their
 * Pull requests. A row opens the task as a chat tab beside Eva
 * (`onOpenTask`), else its full page; rows open as tabs are marked. An
 * archived project's list is read-only.
 */
export function ProjectTasksPanel({
  projectId,
  projectNumId,
  repoId,
  basePath,
  openTaskIds,
  onOpenTask,
  onAskEva,
}: {
  projectId: Id<"projects">;
  projectNumId: number | undefined;
  repoId: Id<"githubRepos">;
  basePath: string;
  /** The tasks open as chat tabs (`?tasks=`); their rows are marked. */
  openTaskIds?: ReadonlySet<string>;
  /** Opens a task as a chat tab; without it a row opens its page. */
  onOpenTask?: (taskNumId: number) => void;
  /** "+": Eva's tab with her composer focused (`ProjectTaskTabs.askEva`). */
  onAskEva: () => void;
}) {
  const navigate = useNavigate();
  const { tasks, failedTaskIds, status } = useProjectTaskStatus(
    projectId,
    repoId,
  );
  const archivedTasks = useQuery(api.agentTasks.listByProject, {
    projectId,
    archived: true,
  });
  // An archived project is read-only: no new tasks.
  const isArchived =
    useQuery(api.projects.get, { id: projectId })?.archivedAt !== undefined;
  const projectSegment = entityPathSegment({ numId: projectNumId });

  const openTask = (taskId: Id<"agentTasks">) => {
    const task = [...(tasks ?? []), ...(archivedTasks ?? [])].find(
      (row) => row._id === taskId,
    );
    if (onOpenTask && task?.numId !== undefined) {
      onOpenTask(task.numId);
      return;
    }
    const taskSegment = task ? entityPathSegment(task) : null;
    if (!projectSegment || !taskSegment) return;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectSegment}/${taskSegment}`,
      ),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Tasks</h2>
          {isArchived ? null : (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="New task"
              onClick={onAskEva}
            >
              <IconPlus size={14} />
            </Button>
          )}
        </div>
        <ProjectProgressBar status={status} className="h-1" />
        {status ? (
          <p className="text-2xs tabular-nums text-muted-foreground">
            {projectStatusCountsLine(status.counts)}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <ProjectTaskListPanel
          projectId={projectId}
          tasks={tasks ?? []}
          archivedTasks={archivedTasks ?? []}
          readOnly={isArchived}
          failedTaskIds={failedTaskIds}
          onSelectTask={openTask}
          openTaskIds={openTaskIds}
          homeRepoId={repoId}
        />
      </div>
    </div>
  );
}
