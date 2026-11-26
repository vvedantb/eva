import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import type { ProjectDocumentsContext } from "@/lib/components/docs/SessionDocumentsPanel";
import type { ChatSource } from "@/lib/components/sandbox/chatSource";
import { ProjectStageCounts } from "./ProjectStageCounts";
import {
  useProjectTaskStatus,
  type ProjectTaskListRow,
} from "./useProjectStatus";

/**
 * What a project's Documents tab adds to the shared panel: the summary doc
 * pinned first with live counts above it, and the child task behind each Log
 * entry. A locked task (repo the reader cannot open) names nothing.
 */
export function useProjectDocuments(
  projectId: Id<"projects">,
  repoId: Id<"githubRepos">,
): ProjectDocumentsContext {
  const summaryDoc = useQuery(api.projects.getSummaryDoc, { projectId });
  const { tasks, status } = useProjectTaskStatus(projectId, repoId);
  const repos = useQuery(api.githubRepos.list, {});
  const reposById = new Map((repos ?? []).map((repo) => [repo._id, repo]));
  const tasksById = new Map<string, ProjectTaskListRow>(
    (tasks ?? []).map((task) => [task._id, task]),
  );

  const taskSource = (taskId: string): ChatSource | undefined => {
    const task = tasksById.get(taskId);
    if (!task || task.locked === true || task.repoId === undefined) {
      return undefined;
    }
    const repo = reposById.get(task.repoId);
    if (!repo) return undefined;
    return {
      kind: "task",
      id: task._id,
      title: task.title,
      numId: task.numId,
      owner: repo.owner,
      repo: repo.name,
      rootDirectory: repo.rootDirectory,
    };
  };

  return {
    summaryDocId: summaryDoc?._id,
    counts: <ProjectStageCounts status={status} />,
    taskSource,
  };
}
