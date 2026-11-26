"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { TASK_TAGS } from "@eva/shared";
import { QuickTaskModal } from "../quick-tasks/QuickTaskModal";
import { useProjectTaskStatus } from "./useProjectStatus";

/**
 * A project's New task (to Triage unless "Start now"): the Tasks tab's `+`
 * and the chat tabs' `+`. Tags offered are the defaults plus the project's.
 */
export function ProjectNewTaskModal({
  projectId,
  repoId,
  isOpen,
  onClose,
}: {
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { tasks } = useProjectTaskStatus(projectId, repoId);
  const users = useQuery(api.users.listAll);
  const projects = useQuery(api.projects.list, { repoId });
  const tagSet = new Set<string>(TASK_TAGS);
  for (const task of tasks ?? []) {
    for (const tag of task.tags ?? []) tagSet.add(tag);
  }
  return (
    <QuickTaskModal
      isOpen={isOpen}
      onClose={onClose}
      projectId={projectId}
      users={users ?? undefined}
      projects={projects ?? undefined}
      allTags={[...tagSet].toSorted()}
    />
  );
}
