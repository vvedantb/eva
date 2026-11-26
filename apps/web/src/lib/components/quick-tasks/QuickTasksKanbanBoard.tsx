"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, taskScheduledAt } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { KanbanBoard } from "@/lib/components/kanban/KanbanBoard";
import { QuickTaskCard } from "./QuickTaskCard";
import type { SelectionToggleOptions } from "./selectionRange";
import { RunAllDialog } from "./RunAllDialog";
import { Button, Spinner, ConfirmSkipHint, skipConfirmTitle } from "@vvedantb/ui";
import { IconPlayerPlay } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import {
  useQuickTaskFilters,
  useQuickTaskTodoDrafts,
} from "@/routes/_repo/$owner/$repo/quick-tasks/_utils";
import { QuickTaskDraftRow } from "./QuickTaskDraftRow";
import { useQuickTaskBoardActions } from "./useQuickTaskBoardActions";
import type { DisplayTaskStatus } from "@/lib/components/tasks/TaskStatusBadge";

type Task = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
type TaskStatus = Task["status"];

interface QuickTasksKanbanBoardProps {
  tasks: Task[];
  isSelecting: boolean;
  selectedIds: Set<Id<"agentTasks">>;
  onToggleSelect: (
    id: Id<"agentTasks">,
    options?: SelectionToggleOptions<Id<"agentTasks">>,
  ) => void;
  /** The Archived list: no drafts, no Run All, Unarchive in card menus. */
  archived?: boolean;
}

export function QuickTasksKanbanBoard({
  tasks: externalTasks,
  isSelecting,
  selectedIds,
  onToggleSelect,
  archived = false,
}: QuickTasksKanbanBoardProps) {
  const { repoId, basePath } = useRepo();
  const groupedCodebases = useQuery(api.githubRepos.listGroupedByCodebase);
  const users = useQuery(api.users.listAll);
  const projects = useQuery(api.projects.list, { repoId });
  const [{ statuses }] = useQuickTaskFilters();
  const liveTodoDrafts = useQuickTaskTodoDrafts(repoId);
  const todoDrafts = archived ? [] : liveTodoDrafts;
  const visibleStatuses = new Set<DisplayTaskStatus>(statuses);

  // Respect the sort order applied by QuickTasksClient (default: updatedAt).
  // Re-sorting here would override the user's chosen sort.
  const tasks = externalTasks;
  const {
    currentUserId,
    errorTaskIdSet,
    changeStatus,
    showRunAll,
    isRunningAll,
    requestRunAll,
    runAllDialog,
  } = useQuickTaskBoardActions(tasks, archived);

  // Shift-click spans one column. `KanbanBoard` groups by status in `tasks`
  // order, so grouping the same way here reproduces each column's visible order.
  const idsByStatus = new Map<TaskStatus, Id<"agentTasks">[]>();
  for (const task of tasks) {
    const column = idsByStatus.get(task.status);
    if (column) {
      column.push(task._id);
    } else {
      idsByStatus.set(task.status, [task._id]);
    }
  }

  if (tasks.length === 0 && todoDrafts.length === 0) {
    return null;
  }

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    const task = tasks.find((t) => t._id === id);
    if (task) await changeStatus(task._id, status);
  };

  return (
    <>
      <KanbanBoard
        items={tasks}
        visibleStatuses={visibleStatuses}
        onStatusChange={handleStatusChange}
        fillHeight
        columnLead={(status) =>
          status === "todo"
            ? todoDrafts.map((draft) => (
                <div key={draft._id} className="pb-1.5">
                  <QuickTaskDraftRow
                    id={draft._id}
                    title={draft.title}
                    description={draft.description}
                  />
                </div>
              ))
            : []
        }
        columnExtra={(status) =>
          status === "todo" && showRunAll ? (
            <Button
              size="sm"
              title={skipConfirmTitle("Run All")}
              onClick={requestRunAll}
              disabled={isRunningAll}
            >
              {isRunningAll ? (
                <Spinner size="sm" />
              ) : (
                <IconPlayerPlay size={14} />
              )}
              Run All
              <ConfirmSkipHint />
            </Button>
          ) : null
        }
        renderCard={(task) => (
          <QuickTaskCard
            id={task._id}
            title={task.title}
            description={task.description}
            status={task.status}
            isAgentActive={task.isExecuting}
            hasUnread={task.hasUnread}
            isAwaitingAnswer={task.isAwaitingAnswer}
            archived={archived}
            priority={task.priority}
            numId={task.numId}
            hasError={errorTaskIdSet.has(task._id)}
            sandboxStatus={task.sandboxStatus}
            scheduledAt={taskScheduledAt(task)}
            tags={task.tags}
            createdByUser={users?.find((u) => u._id === task.createdBy)}
            createdAt={task.createdAt}
            href={
              entityPathSegment(task)
                ? `${basePath}/quick-tasks/${entityPathSegment(task)}`
                : `${basePath}/quick-tasks`
            }
            onClick={
              isSelecting
                ? (event) => {
                    event.preventDefault();
                    onToggleSelect(task._id, {
                      range: event.shiftKey,
                      orderedIds: idsByStatus.get(task.status),
                    });
                  }
                : undefined
            }
            groupedCodebases={groupedCodebases ?? undefined}
            isSelecting={isSelecting}
            isSelected={selectedIds.has(task._id)}
            onToggleSelect={(event) =>
              onToggleSelect(task._id, {
                range: event.shiftKey,
                orderedIds: idsByStatus.get(task.status),
              })
            }
            assignedTo={task.assignedTo}
            projectId={task.projectId}
            repoId={task.repoId ?? repoId}
            users={users ?? undefined}
            currentUserId={currentUserId ?? undefined}
            projects={projects ?? undefined}
          />
        )}
        renderOverlay={(task) => (
          <QuickTaskCard
            id={task._id}
            title={task.title}
            description={task.description}
            status={task.status}
            isAgentActive={task.isExecuting}
            hasUnread={task.hasUnread}
            isAwaitingAnswer={task.isAwaitingAnswer}
            archived={archived}
            priority={task.priority}
            numId={task.numId}
            hasError={errorTaskIdSet.has(task._id)}
            sandboxStatus={task.sandboxStatus}
            scheduledAt={taskScheduledAt(task)}
            tags={task.tags}
            createdByUser={users?.find((u) => u._id === task.createdBy)}
            createdAt={task.createdAt}
            groupedCodebases={groupedCodebases ?? undefined}
            isSelecting={isSelecting}
            isSelected={selectedIds.has(task._id)}
            assignedTo={task.assignedTo}
            projectId={task.projectId}
            repoId={task.repoId ?? repoId}
            users={users ?? undefined}
            currentUserId={currentUserId ?? undefined}
            projects={projects ?? undefined}
          />
        )}
      />
      <RunAllDialog {...runAllDialog} />
    </>
  );
}
