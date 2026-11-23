"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id } from "@eva/backend";
import { TASK_TAGS } from "@eva/shared";
import { Button } from "@vvedantb/ui";
import { IconPlus } from "@tabler/icons-react";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { QuickTaskModal } from "../quick-tasks/QuickTaskModal";
import { ProjectProgressBar } from "./ProjectProgressBar";
import { ProjectStageCounts } from "./ProjectStageCounts";
import { ProjectTaskListPanel } from "./ProjectTaskListPanel";
import { useProjectTaskStatus } from "./useProjectStatus";

/**
 * The coordinator rail's Tasks tab: the title (with "+" for a contributor),
 * the progress bar and counts, then the tasks grouped Triage, Working,
 * Blocked, Idle, Archived. A row opens the task in place of the coordinator.
 */
export function ProjectTasksPanel({
  projectId,
  projectNumId,
  repoId,
  basePath,
  canContribute,
}: {
  projectId: Id<"projects">;
  projectNumId: number | undefined;
  repoId: Id<"githubRepos">;
  basePath: string;
  canContribute: boolean;
}) {
  const navigate = useNavigate();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const { tasks, failedTaskIds, status } = useProjectTaskStatus(
    projectId,
    repoId,
  );
  const users = useQuery(api.users.listAll);
  const projects = useQuery(api.projects.list, { repoId });
  const projectSegment = entityPathSegment({ numId: projectNumId });

  const openTask = (taskId: Id<"agentTasks">) => {
    const task = tasks?.find((row) => row._id === taskId);
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
          {canContribute ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="New task"
              onClick={() => setCreateTaskOpen(true)}
            >
              <IconPlus size={14} />
            </Button>
          ) : null}
        </div>
        <ProjectProgressBar status={status} />
        <ProjectStageCounts status={status} />
      </div>
      <div className="min-h-0 flex-1">
        <ProjectTaskListPanel
          projectId={projectId}
          tasks={tasks ?? []}
          failedTaskIds={failedTaskIds}
          onSelectTask={openTask}
          projectNumId={projectNumId}
          homeRepoId={repoId}
          canContribute={canContribute}
        />
      </div>
      {canContribute ? (
        <QuickTaskModal
          isOpen={createTaskOpen}
          onClose={() => setCreateTaskOpen(false)}
          projectId={projectId}
          users={users ?? undefined}
          projects={projects ?? undefined}
          allTags={[...tagSet].sort()}
        />
      ) : null}
    </div>
  );
}
