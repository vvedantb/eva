"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id } from "@eva/backend";
import type { ChatInlineCard } from "@/lib/components/chat/ChatBody";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { ProjectTaskBatchCard } from "./ProjectTaskBatchCard";
import { useProjectTaskNotes, useProjectTaskStatus } from "./useProjectStatus";

/**
 * The project route's task pane for one task (`ProjectActiveLayout`), or
 * null while either number is unknown.
 */
export function projectTaskPaneHref(
  basePath: string,
  project: { numId?: number },
  task: { numId?: number },
): string | null {
  const projectSegment = entityPathSegment(project);
  const taskSegment = entityPathSegment(task);
  if (!projectSegment || !taskSegment) return null;
  return `${basePath}/projects/${projectSegment}/${taskSegment}/activity`;
}

/**
 * One live task card for each batch the project's coordinator proposed
 * (`listTaskBatches`), for `ChatBody` to place under the turn that proposed
 * it. The rows come from the project's task list (`listByProject`), so the
 * card and the list always agree.
 */
export function useProjectTaskBatchCards(
  projectId: Id<"projects">,
): ChatInlineCard[] {
  const navigate = useNavigate();
  const { basePath, repo } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });
  const batches = useQuery(api.projects.listTaskBatches, { projectId });
  const { tasks, failedTaskIds } = useProjectTaskStatus(projectId, repo._id);
  const notesByTask = useProjectTaskNotes(projectId);
  const repos = useQuery(api.githubRepos.list, {});
  if (!project || !batches || !tasks) return [];

  const reposById = new Map<string, RepoAppMarkRepo>(
    (repos ?? []).map((row) => [row._id, row]),
  );
  const taskById = new Map(tasks.map((task) => [String(task._id), task]));
  const openTask = (taskId: Id<"agentTasks">) => {
    const task = taskById.get(String(taskId));
    const href = task ? projectTaskPaneHref(basePath, project, task) : null;
    if (href === null) return;
    void navigate({ to: toInternalRepoHref(href) });
  };

  return batches.map((batch) => ({
    _id: batch._id,
    messageId: batch.messageId,
    createdAt: batch.createdAt,
    node: (
      <ProjectTaskBatchCard
        key={batch._id}
        projectId={projectId}
        projectNumId={project.numId}
        homeRepoId={project.repoId}
        canContribute={project.callerRole === "contributor"}
        tasks={batch.taskIds.flatMap((id) => {
          const task = taskById.get(String(id));
          return task ? [task] : [];
        })}
        failedTaskIds={failedTaskIds}
        notesByTask={notesByTask}
        reposById={reposById}
        onSelectTask={openTask}
      />
    ),
  }));
}
