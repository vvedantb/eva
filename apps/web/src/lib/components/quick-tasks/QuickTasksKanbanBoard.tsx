"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { KanbanBoard } from "@/lib/components/kanban/KanbanBoard";
import { isTaskAgentActive, QuickTaskCard } from "./QuickTaskCard";
import { RunAllDialog } from "./RunAllDialog";
import { Button, Spinner, toast } from "@eva/ui";
import { IconPlayerPlay } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import { entityPathSegment } from "@/lib/numId";
import { useQuickTaskFilters } from "@/routes/_repo/$owner/$repo/quick-tasks/_utils";
import type { DisplayTaskStatus } from "@/lib/components/tasks/TaskStatusBadge";

type Task = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
type TaskStatus = Task["status"];

interface QuickTasksKanbanBoardProps {
  tasks: Task[];
  projectNames: Map<string, string>;
  isSelecting: boolean;
  selectedIds: Set<Id<"agentTasks">>;
  onToggleSelect: (id: Id<"agentTasks">) => void;
}

export function QuickTasksKanbanBoard({
  tasks: externalTasks,
  projectNames,
  isSelecting,
  selectedIds,
  onToggleSelect,
}: QuickTasksKanbanBoardProps) {
  const { repoId, basePath } = useRepo();
  const currentUserId = useQuery(api.auth.me);
  const groupedCodebases = useQuery(api.githubRepos.listGroupedByCodebase);
  const users = useQuery(api.users.listAll);
  const projects = useQuery(api.projects.list, { repoId });
  const projectNumIds = new Map(
    (projects ?? []).flatMap((project) =>
      project.numId === undefined ? [] : [[project._id, project.numId] as const],
    ),
  );
  const updateStatus = useMutation(
    api.agentTasks.updateStatus,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.agentTasks.getAllTasks, { repoId });
    if (current !== undefined) {
      localStore.setQuery(
        api.agentTasks.getAllTasks,
        { repoId },
        current.map((task) =>
          task._id === args.id
            ? { ...task, status: args.status, updatedAt: Date.now() }
            : task,
        ),
      );
    }
  });
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [{ statuses }] = useQuickTaskFilters();
  const visibleStatuses = new Set<DisplayTaskStatus>(statuses);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const altHeld = useAltHeld();

  // Respect the sort order applied by QuickTasksClient (default: updatedAt).
  // Re-sorting here would override the user's chosen sort.
  const tasks = externalTasks;

  const taskIds = tasks.map((t) => t._id);
  const errorTaskIds = useQuery(api.agentRuns.getTaskIdsWithLatestRunError, {
    repoId,
    taskIds,
  });
  const errorTaskIdSet = new Set(errorTaskIds ?? []);
  const deploymentStatuses = useQuery(
    api.agentRuns.getLatestDeploymentStatuses,
    {
      repoId,
      taskIds,
    },
  );
  const deploymentStatusMap = new Map<
    string,
    "queued" | "building" | "deployed" | "error"
  >();
  for (const entry of deploymentStatuses ?? []) {
    deploymentStatusMap.set(entry.taskId, entry.deploymentStatus);
  }

  if (tasks.length === 0) {
    return null;
  }

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    const task = tasks.find((t) => t._id === id);
    if (task) await updateStatus({ id: task._id, status });
  };

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const ownedTodoTasks = todoTasks.filter((t) => t.createdBy === currentUserId);
  const skippedCount = todoTasks.length - ownedTodoTasks.length;

  const handleRunAll = async () => {
    if (ownedTodoTasks.length === 0) return;
    setIsRunningAll(true);
    try {
      const results = await Promise.all(
        ownedTodoTasks.map(async (task) => {
          try {
            await startExecution({ id: task._id });
            return true;
          } catch (err) {
            console.error(`Failed to start task ${task._id}:`, err);
            return false;
          }
        }),
      );
      const failedCount = results.filter((started) => !started).length;
      if (failedCount > 0) {
        console.error(
          `Run All started ${ownedTodoTasks.length - failedCount} of ${ownedTodoTasks.length} tasks`,
        );
        toast.error(
          `Could not start ${failedCount} of ${ownedTodoTasks.length} tasks.`,
        );
      }
    } catch (err) {
      console.error("Failed to run all:", err);
    }
    setIsRunningAll(false);
  };

  return (
    <>
      <KanbanBoard
        items={tasks}
        visibleStatuses={visibleStatuses}
        onStatusChange={handleStatusChange}
        fillHeight
        columnExtra={(status) =>
          status === "todo" && todoTasks.length > 0 ? (
            <Button
              size="sm"
              title={skipConfirmTitle("Run All")}
              onClick={(event) =>
                requestConfirm(
                  altHeld,
                  () => setIsConfirmOpen(true),
                  () => {
                    void handleRunAll();
                  },
                  event,
                )
              }
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
            isAgentActive={isTaskAgentActive(task)}
            priority={task.priority}
            numId={task.numId}
            projectNumId={
              task.projectId ? projectNumIds.get(task.projectId) : undefined
            }
            hasError={errorTaskIdSet.has(task._id)}
            deploymentStatus={deploymentStatusMap.get(task._id)}
            sandboxStatus={task.reviewTaskSandboxStatus}
            scheduledAt={task.scheduledAt}
            tags={task.tags}
            createdByUser={users?.find((u) => u._id === task.createdBy)}
            createdAt={task.createdAt}
            projectName={
              task.projectId ? projectNames.get(task.projectId) : undefined
            }
            href={
              entityPathSegment(task)
                ? `${basePath}/quick-tasks/${entityPathSegment(task)}`
                : `${basePath}/quick-tasks`
            }
            onClick={
              isSelecting
                ? (event) => {
                    event.preventDefault();
                    onToggleSelect(task._id);
                  }
                : undefined
            }
            groupedCodebases={groupedCodebases ?? undefined}
            isSelecting={isSelecting}
            isSelected={selectedIds.has(task._id)}
            onToggleSelect={() => onToggleSelect(task._id)}
            assignedTo={task.assignedTo}
            model={task.model}
            providerAccountId={task.providerAccountId}
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
            isAgentActive={isTaskAgentActive(task)}
            priority={task.priority}
            numId={task.numId}
            projectNumId={
              task.projectId ? projectNumIds.get(task.projectId) : undefined
            }
            hasError={errorTaskIdSet.has(task._id)}
            deploymentStatus={deploymentStatusMap.get(task._id)}
            sandboxStatus={task.reviewTaskSandboxStatus}
            scheduledAt={task.scheduledAt}
            tags={task.tags}
            createdByUser={users?.find((u) => u._id === task.createdBy)}
            createdAt={task.createdAt}
            projectName={
              task.projectId ? projectNames.get(task.projectId) : undefined
            }
            groupedCodebases={groupedCodebases ?? undefined}
            isSelecting={isSelecting}
            isSelected={selectedIds.has(task._id)}
            assignedTo={task.assignedTo}
            model={task.model}
            providerAccountId={task.providerAccountId}
            projectId={task.projectId}
            repoId={task.repoId ?? repoId}
            users={users ?? undefined}
            currentUserId={currentUserId ?? undefined}
            projects={projects ?? undefined}
          />
        )}
      />
      <RunAllDialog
        isOpen={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        ownedCount={ownedTodoTasks.length}
        skippedCount={skippedCount}
        onConfirm={handleRunAll}
        isLoading={isRunningAll}
      />
    </>
  );
}
