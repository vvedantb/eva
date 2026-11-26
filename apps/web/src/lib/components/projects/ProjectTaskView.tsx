"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { Spinner } from "@vvedantb/ui";
import { IconArrowLeft, IconFileText } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { TaskDetailInline } from "@/lib/components/tasks/TaskDetailInline";
import type { EntityResolveStatus } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { ProjectSummaryDocLink } from "./ProjectSummarySection";
import { ProjectTaskFacts } from "./ProjectTaskFacts";
import { useProjectTaskStatus } from "./useProjectStatus";

/**
 * One project task in place of the coordinator: a header (a back link to the
 * coordinator's Tasks tab, the task's number and title over its status and
 * PR line, `ProjectTaskFacts`, and a link to the project's summary doc), then
 * the task's own chat and sandbox (the quick task's sandbox view,
 * `TaskDetailInline` in `project-task` mode). A task that has never run
 * shows its prompt in its chat. A task of another project, or one the reader
 * cannot open, is not found.
 */
export function ProjectTaskView({
  projectId,
  repoId,
  projectNumId,
  coordinatorHref,
  documentsHref,
  taskId,
  taskStatus,
}: {
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  projectNumId: number | undefined;
  /** The coordinator's Tasks tab (pre-internal form). */
  coordinatorHref: string;
  /** The project's Documents tab (pre-internal form), or undefined without a numId. */
  documentsHref: string | undefined;
  taskId: Id<"agentTasks"> | undefined;
  taskStatus: EntityResolveStatus | undefined;
}) {
  const navigate = useNavigate();
  const { tasks } = useProjectTaskStatus(projectId, repoId);
  const summaryDoc = useQuery(api.projects.getSummaryDoc, { projectId });
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
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <EntityNumLabel
              numId={task.taskNumber}
              projectNumId={projectNumId}
            />
            <span className="truncate text-sm font-medium text-foreground">
              {task.title}
            </span>
          </div>
          <ProjectTaskFacts task={task} />
        </div>
        {summaryDoc && documentsHref ? (
          <ProjectSummaryDocLink
            docId={summaryDoc._id}
            documentsHref={documentsHref}
            className="ml-auto min-w-0 shrink"
          >
            <IconFileText size={14} className="shrink-0" />
            <span className="truncate">{summaryDoc.title}</span>
          </ProjectSummaryDocLink>
        ) : null}
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
