"use client";

import type { Id } from "@eva/backend";
import { projectChatTaskCard } from "@eva/shared/projectView";
import { ListRow } from "@vvedantb/ui";
import { projectTaskDisplayStatusConfig } from "./ProjectPhaseBadge";
import { useProjectTaskStatus } from "./useProjectStatus";

/** What a coordinator chat needs to draw its task cards (`ChatBody`). */
export interface ProjectChatTaskCards {
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  onOpenTask: (taskNumId: number) => void;
}

/**
 * A task Eva created or gave work to in this turn, under her reply: the
 * Tasks list's status icon, "#N title" and the task's stage. It reads the
 * project's task list, so the stage stays live. A click opens the task's chat
 * tab. A task the reader cannot open, or no longer in the list, shows nothing.
 */
export function ProjectChatTaskCard({
  taskId,
  projectId,
  repoId,
  onOpenTask,
}: {
  taskId: Id<"agentTasks">;
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  onOpenTask: (taskNumId: number) => void;
}) {
  const { tasks, failedTaskIds } = useProjectTaskStatus(projectId, repoId);
  const card = projectChatTaskCard(tasks ?? [], taskId, failedTaskIds);
  if (card === null) return null;
  const config = projectTaskDisplayStatusConfig[card.view.displayStatus];
  const StatusIcon = config.icon;
  return (
    <ListRow
      onClick={() => onOpenTask(card.numId)}
      aria-label={`#${card.numId} ${card.title}, ${card.stageLabel}`}
      className="bg-muted/60"
      contentClassName="flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-2sm"
      data-testid="chat-task-card"
    >
      <StatusIcon size={14} className={`shrink-0 ${config.text}`} aria-hidden />
      <span className="shrink-0 tabular-nums text-muted-foreground">
        #{card.numId}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {card.title}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {card.stageLabel}
      </span>
    </ListRow>
  );
}
