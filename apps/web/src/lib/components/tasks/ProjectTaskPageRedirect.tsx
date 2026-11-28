"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { Navigate } from "@tanstack/react-router";
import { api, type Doc } from "@eva/backend";
import { Spinner } from "@vvedantb/ui";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

/**
 * A project task opened on the quick task page (an "Open in new tab" link):
 * it goes to its project task page, where it is its chat.
 */
export function ProjectTaskPageRedirect({ task }: { task: Doc<"agentTasks"> }) {
  const { basePath } = useRepo();
  const project = useQuery(
    api.projects.get,
    task.projectId === undefined ? "skip" : { id: task.projectId },
  );
  if (project === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner variant="circle" size="sm" className="size-5" />
      </div>
    );
  }
  const projectSegment = project ? entityPathSegment(project) : null;
  const taskSegment = entityPathSegment(task);
  if (projectSegment === null || taskSegment === null) {
    return <EntityNotFound entityLabel="task" />;
  }
  return (
    <Navigate
      to={toInternalRepoHref(
        `${basePath}/projects/${projectSegment}/${taskSegment}`,
      )}
      replace
    />
  );
}
