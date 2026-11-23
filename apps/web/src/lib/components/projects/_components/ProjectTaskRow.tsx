"use client";

import type { Id } from "@eva/backend";
import { taskScheduledAt } from "@eva/backend";
import type { NeedsYouReason } from "@eva/shared/projectStatus";
import { IconLock } from "@tabler/icons-react";
import { ListRow, Tooltip, TooltipContent, TooltipTrigger } from "@vvedantb/ui";
import { QuickTaskCard } from "@/lib/components/quick-tasks/QuickTaskCard";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { entityPathSegment } from "@/lib/numId";
import type { ProjectTaskListRow } from "../useProjectStatus";
import { projectTaskStageConfig } from "../ProjectPhaseBadge";
import { ProjectTaskBadges } from "./ProjectTaskBadges";

/**
 * One row of a project's task list. A task in a repo the reader cannot open
 * is a locked row: its number and a lock, no title and no link.
 */
export function ProjectTaskRow({
  task,
  needsYou,
  hasError,
  selectedTaskId,
  onSelectTask,
  basePath,
  projectNumId,
  homeRepoId,
  reposById,
  canContribute,
}: {
  task: ProjectTaskListRow;
  needsYou: NeedsYouReason | undefined;
  hasError: boolean;
  selectedTaskId: Id<"agentTasks"> | null;
  onSelectTask: (id: Id<"agentTasks">) => void;
  basePath: string;
  projectNumId?: number;
  homeRepoId: Id<"githubRepos">;
  reposById: ReadonlyMap<string, RepoAppMarkRepo>;
  canContribute: boolean;
}) {
  if (task.locked === true) {
    return (
      <ListRow
        accentClassName={projectTaskStageConfig.todo.bar}
        aria-label="Locked task"
        contentClassName="flex items-center gap-1.5 px-2.5 py-2 pl-3 sm:px-3 sm:py-2.5 sm:pl-3.5"
      >
        <EntityNumLabel numId={task.taskNumber} projectNumId={projectNumId} />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative flex items-center text-muted-foreground hit-target">
              <IconLock size={14} aria-hidden />
            </span>
          </TooltipTrigger>
          <TooltipContent>You do not have access to this repo</TooltipContent>
        </Tooltip>
      </ListRow>
    );
  }
  const segment = entityPathSegment(task);
  const otherRepo =
    task.repoId !== undefined && task.repoId !== homeRepoId
      ? reposById.get(task.repoId)
      : undefined;
  const isFeedback = task.origin === "feedback";
  const canCancel =
    canContribute && task.status === "todo" && task.approvedAt === undefined;
  const hasBadges =
    needsYou !== undefined ||
    isFeedback ||
    otherRepo !== undefined ||
    task.prUrl !== undefined ||
    canCancel;
  return (
    <QuickTaskCard
      id={task._id}
      title={task.title}
      description={task.description}
      status={task.status}
      isAgentActive={task.isExecuting}
      hasUnread={task.hasUnread}
      isAwaitingAnswer={task.isAwaitingAnswer}
      hasError={hasError}
      sandboxStatus={task.sandboxStatus}
      numId={task.numId}
      projectNumId={projectNumId}
      tags={task.tags}
      createdAt={task._creationTime}
      scheduledAt={taskScheduledAt(task)}
      href={
        segment
          ? `${basePath}/quick-tasks/${segment}`
          : `${basePath}/quick-tasks`
      }
      isActive={selectedTaskId === task._id}
      onClick={(event) => {
        event.preventDefault();
        onSelectTask(task._id);
      }}
      assignedTo={task.assignedTo}
      projectId={task.projectId}
      repoId={task.repoId}
      badges={
        hasBadges ? (
          <ProjectTaskBadges
            taskId={task._id}
            needsYou={needsYou}
            isFeedback={isFeedback}
            repo={otherRepo}
            prUrl={task.prUrl}
            prState={task.prState}
            canCancel={canCancel}
          />
        ) : undefined
      }
    />
  );
}
