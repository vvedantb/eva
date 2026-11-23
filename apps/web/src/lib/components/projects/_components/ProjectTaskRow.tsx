"use client";

import type { Id } from "@eva/backend";
import { taskScheduledAt } from "@eva/backend";
import {
  isUnapprovedTodoTask,
  projectTaskOriginLabel,
  type ProjectTaskNotes,
  type ProjectTaskView,
} from "@eva/shared/projectView";
import { IconLock } from "@tabler/icons-react";
import {
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
import { ProjectTaskBadges } from "./ProjectTaskBadges";

/**
 * One compact row of a project's task list: the stripe is the task's display
 * status (`projectTaskDisplayStatus`). A Triage row's second line is its
 * origin, and a contributor approves or rejects it there. A task in a repo
 * the reader cannot open is a locked row: its number and a lock, no title
 * and no link.
 */
export function ProjectTaskRow({
  task,
  view,
  notes,
  hasError,
  authorName,
  onSelectTask,
  basePath,
  projectNumId,
  homeRepoId,
  reposById,
  canContribute,
}: {
  task: ProjectTaskListRow;
  view: ProjectTaskView;
  /** The task's open question and open reports (`useProjectTaskNotes`). */
  notes: ProjectTaskNotes | undefined;
  hasError: boolean;
  /** The feedback author's first name, once known. */
  authorName: string | undefined;
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
  const isTriage = view.displayStatus === "triage";
  // In Triage the origin replaces the Feedback badge and "Needs approval".
  const origin = isTriage
    ? projectTaskOriginLabel(task.origin, authorName)
    : undefined;
  const isFeedback = !isTriage && task.origin === "feedback";
  const needsYou = isTriage ? undefined : view.needsYou;
  const canTriage = canContribute && isTriage && isUnapprovedTodoTask(task);
  const { waitingForCoordinator } = view;
  const reports = notes?.reports ?? [];
  const hasBadges =
    origin !== undefined ||
    needsYou !== undefined ||
    waitingForCoordinator ||
    notes?.ask !== undefined ||
    reports.length > 0 ||
    task.phaseLabel !== undefined ||
    isFeedback ||
    otherRepo !== undefined ||
    task.prUrl !== undefined ||
    canTriage;
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
          <ProjectTaskBadges
              taskId={task._id}
              projectId={task.projectId}
              origin={origin}
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
              canTriage={canTriage}
            />
        ) : undefined
      }
    />
  );
}
