"use client";

import type { Id } from "@eva/backend";
import { taskScheduledAt } from "@eva/backend";
import type {
  ProjectTaskNotes,
  ProjectTaskView,
} from "@eva/shared/projectView";
import { IconLock } from "@tabler/icons-react";
import {
  Badge,
  ListRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { QuickTaskCard } from "@/lib/components/quick-tasks/QuickTaskCard";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { entityPathSegment } from "@/lib/numId";
import type { ProjectTaskListRow } from "../useProjectStatus";
import { projectTaskDisplayStatusConfig } from "../ProjectPhaseBadge";
import { BADGE_CLASS, ProjectTaskBadges } from "./ProjectTaskBadges";

/**
 * One compact row of a project's task list, and of the coordinator chat's
 * task cards: the stripe is the task's display status
 * (`projectTaskDisplayStatus`), and `showStatus` names it where no section
 * header does. A task in a repo the reader cannot open is a locked row: its
 * number and a lock, no title and no link.
 */
export function ProjectTaskRow({
  task,
  view,
  showStatus = false,
  notes,
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
  view: ProjectTaskView;
  /** Name the display status in a badge (the chat card has no sections). */
  showStatus?: boolean;
  /** The task's open question and open reports (`useProjectTaskNotes`). */
  notes: ProjectTaskNotes | undefined;
  hasError: boolean;
  selectedTaskId: Id<"agentTasks"> | null;
  onSelectTask: (id: Id<"agentTasks">) => void;
  basePath: string;
  projectNumId?: number;
  homeRepoId: Id<"githubRepos">;
  reposById: ReadonlyMap<string, RepoAppMarkRepo>;
  canContribute: boolean;
}) {
  const statusConfig = projectTaskDisplayStatusConfig[view.displayStatus];
  if (task.locked === true) {
    return (
      <ListRow
        accentClassName={statusConfig.bar}
        aria-label="Locked task"
        contentClassName="flex items-center gap-1.5 px-2.5 py-1.5 pl-3"
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
  const { needsYou, waitingForCoordinator } = view;
  const reports = notes?.reports ?? [];
  const StatusIcon = statusConfig.icon;
  const hasBadges =
    showStatus ||
    needsYou !== undefined ||
    waitingForCoordinator ||
    notes?.ask !== undefined ||
    reports.length > 0 ||
    task.phaseLabel !== undefined ||
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
      compact
      accent={{
        className: statusConfig.bar,
        working: view.displayStatus === "working",
      }}
      badges={
        hasBadges ? (
          <>
            {showStatus ? (
              <Badge variant="secondary" className={BADGE_CLASS}>
                <span className="flex min-w-0 items-center gap-0.5">
                  <StatusIcon
                    className={`size-2.5 shrink-0 ${statusConfig.text}`}
                  />
                  {statusConfig.label}
                </span>
              </Badge>
            ) : null}
            <ProjectTaskBadges
              taskId={task._id}
              needsYou={needsYou}
              waitingForCoordinator={waitingForCoordinator}
              ask={notes?.ask}
              reports={reports}
              chatHref={
                segment
                  ? `${basePath}/quick-tasks/${segment}/sandbox/preview`
                  : undefined
              }
              phaseLabel={task.phaseLabel}
              isFeedback={isFeedback}
              repo={otherRepo}
              prUrl={task.prUrl}
              prState={task.prState}
              canCancel={canCancel}
            />
          </>
        ) : undefined
      }
    />
  );
}
