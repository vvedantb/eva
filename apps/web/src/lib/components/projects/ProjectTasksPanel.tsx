"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id } from "@eva/backend";
import { TASK_TAGS } from "@eva/shared";
import { projectStatusCountsLine } from "@eva/shared/projectView";
import { Button } from "@vvedantb/ui";
import { IconPlus } from "@tabler/icons-react";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { QuickTaskModal } from "../quick-tasks/QuickTaskModal";
import { ProjectProgressBar } from "./ProjectProgressBar";
import { ProjectTaskListPanel } from "./ProjectTaskListPanel";
import { useProjectTaskStatus } from "./useProjectStatus";
import {
  defaultProjectTaskTab,
  type ProjectTaskTab,
} from "./projectSandboxTabs";

/**
 * The coordinator rail's Tasks tab: the title with "+" (a new task, to Triage
 * unless "Start now"), a thin progress bar
 * and the counts as one muted line, then the tasks grouped Triage, Working,
 * Blocked, Idle, Archived (with the tasks archived on their own), and their
 * Pull requests. A row opens the task in the panel beside the coordinator
 * (`onOpenTask`), else its full page; the open task's row is marked. An
 * archived project's list is read-only.
 */
export function ProjectTasksPanel({
  projectId,
  projectNumId,
  repoId,
  basePath,
  openTaskId,
  onOpenTask,
}: {
  projectId: Id<"projects">;
  projectNumId: number | undefined;
  repoId: Id<"githubRepos">;
  basePath: string;
  /** The task open in the panel (`?task=`); its row is marked. */
  openTaskId?: Id<"agentTasks">;
  /** Opens a task in the panel on `tab`; without it a row opens its page. */
  onOpenTask?: (taskNumId: number, tab: ProjectTaskTab) => void;
}) {
  const navigate = useNavigate();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const { tasks, failedTaskIds, status } = useProjectTaskStatus(
    projectId,
    repoId,
  );
  const archivedTasks = useQuery(api.agentTasks.listByProject, {
    projectId,
    archived: true,
  });
  const users = useQuery(api.users.listAll);
  const projects = useQuery(api.projects.list, { repoId });
  // An archived project is read-only: no new tasks.
  const isArchived =
    useQuery(api.projects.get, { id: projectId })?.archivedAt !== undefined;
  const projectSegment = entityPathSegment({ numId: projectNumId });

  const openTask = (taskId: Id<"agentTasks">) => {
    const task = [...(tasks ?? []), ...(archivedTasks ?? [])].find(
      (row) => row._id === taskId,
    );
    if (onOpenTask && task?.numId !== undefined) {
      onOpenTask(task.numId, defaultProjectTaskTab(task));
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

  const tagSet = new Set<string>(TASK_TAGS);
  for (const task of tasks ?? []) {
    for (const tag of task.tags ?? []) tagSet.add(tag);
  }

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
              onClick={() => setCreateTaskOpen(true)}
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
          openTaskId={openTaskId}
          homeRepoId={repoId}
        />
      </div>
      <QuickTaskModal
        isOpen={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        projectId={projectId}
        users={users ?? undefined}
        projects={projects ?? undefined}
        allTags={[...tagSet].sort()}
      />
    </div>
  );
}
