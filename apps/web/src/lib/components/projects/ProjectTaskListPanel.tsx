"use client";

import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Virtuoso } from "react-virtuoso";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
  useDragSensors,
} from "@eva/ui";
import { QuickTaskCard } from "@/lib/components/quick-tasks/QuickTaskCard";
import { isTaskAgentActive } from "@/lib/components/tasks/taskAgentActivity";
import {
  statusConfig,
  TASK_STATUSES,
} from "@/lib/components/tasks/TaskStatusBadge";
import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import { ListEnter, useFirstPaintGate } from "@/lib/components/ui/ListEnter";

type Task = FunctionReturnType<typeof api.agentTasks.listByProject>[number];
type TaskStatus = Task["status"];

function SortableTaskWrapper({
  task,
  selectedTaskId,
  onSelectTask,
  hasError,
  basePath,
  projectNumId,
  index,
  firstPaint,
}: {
  task: Task;
  selectedTaskId: Id<"agentTasks"> | null;
  onSelectTask: (id: Id<"agentTasks">) => void;
  hasError: boolean;
  basePath: string;
  projectNumId?: number;
  index: number;
  firstPaint: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        aria-label={`Reorder ${task.title}`}
        className="max-sm:hit-target cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0 max-sm:p-1.5"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={14} aria-hidden />
      </button>
      <div className="flex-1 min-w-0">
        <ListEnter index={index} firstPaint={firstPaint}>
        <QuickTaskCard
          id={task._id}
          title={task.title}
          description={task.description}
          status={task.status}
          isAgentActive={isTaskAgentActive(task)}
          hasError={hasError}
          sandboxStatus={task.reviewTaskSandboxStatus}
          numId={task.numId}
          projectNumId={projectNumId}
          tags={task.tags}
          createdAt={task._creationTime}
          scheduledAt={task.scheduledAt}
          href={
            entityPathSegment(task)
              ? `${basePath}/quick-tasks/${entityPathSegment(task)}`
              : `${basePath}/quick-tasks`
          }
          isActive={selectedTaskId === task._id}
          onClick={(event) => {
            event.preventDefault();
            onSelectTask(task._id);
          }}
          assignedTo={task.assignedTo}
          model={task.model}
          providerAccountId={task.providerAccountId}
          projectId={task.projectId}
          repoId={task.repoId}
        />
        </ListEnter>
      </div>
    </div>
  );
}

interface ProjectTaskListPanelProps {
  tasks: Task[];
  selectedTaskId: Id<"agentTasks"> | null;
  onSelectTask: (id: Id<"agentTasks">) => void;
  onCreateTask: () => void;
  projectNumId?: number;
}

export function ProjectTaskListPanel({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  projectNumId,
}: ProjectTaskListPanelProps) {
  const { repoId, basePath } = useRepo();
  const firstPaint = useFirstPaintGate();
  const [localTodoOrder, setLocalTodoOrder] = useState<
    Id<"agentTasks">[] | null
  >(null);
  const reorderTasks = useMutation(api.agentTasks.reorderProjectTasks);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);

  const taskIds = tasks.map((t) => t._id);
  const errorTaskIds = useQuery(api.agentRuns.getTaskIdsWithLatestRunError, {
    repoId,
    taskIds,
  });
  const errorTaskIdSet = new Set(errorTaskIds ?? []);

  const groupedTasks: Record<TaskStatus, Task[]> = {
    draft: [],
    todo: [],
    in_progress: [],
    code_review: [],
    business_review: [],
    done: [],
    cancelled: [],
  };
  for (const task of tasks) {
    groupedTasks[task.status].push(task);
  }
  // Sort non-todo groups by latest run date (descending), falling back to createdAt
  const sortByLastRun = (a: Task, b: Task) => {
    const aTime = a.lastRunStartedAt ?? a.createdAt;
    const bTime = b.lastRunStartedAt ?? b.createdAt;
    return bTime - aTime;
  };
  for (const [status, group] of Object.entries(groupedTasks)) {
    if (status !== "todo") {
      group.sort(sortByLastRun);
    }
  }

  let todoTasks = groupedTasks.todo;
  if (localTodoOrder) {
    const taskMap = new Map(groupedTasks.todo.map((t) => [t._id, t]));
    const orderSet = new Set(localTodoOrder);
    const ordered: Task[] = [];
    for (const id of localTodoOrder) {
      const task = taskMap.get(id);
      if (task) ordered.push(task);
    }
    for (const task of groupedTasks.todo) {
      if (!orderSet.has(task._id)) ordered.push(task);
    }
    todoTasks = ordered;
  }

  // Mouse arms on distance, touch on a hold — a single PointerSensor cannot do
  // both, and distance-based activation on touch loses the pointer to the list's
  // own scroll, so reorder was impossible on a phone.
  const sensors = useDragSensors({ sortable: true });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = todoTasks.findIndex((t) => t._id === active.id);
    const newIndex = todoTasks.findIndex((t) => t._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const currentOrder = todoTasks.map((t) => t._id);
    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    setLocalTodoOrder(newOrder);

    const projectId = todoTasks[0]?.projectId;
    if (projectId) {
      reorderTasks({
        projectId,
        taskIds: newOrder,
      }).then(() => {
        setLocalTodoOrder(null);
      });
    }
  };

  const nonEmptyStatuses = TASK_STATUSES.filter(
    (status) => groupedTasks[status].length > 0,
  );
  const defaultExpandedKeys = nonEmptyStatuses.filter(
    (s) => s !== "done" && s !== "cancelled",
  );

  return (
    <div
      ref={(node) => {
        setScrollParent(node);
      }}
      className="h-full overflow-y-auto scrollbar scroll-fade"
    >
      <Accordion
        type="multiple"
        className="px-3 [&_hr]:bg-border"
        defaultValue={defaultExpandedKeys}
      >
        {TASK_STATUSES.map((status) => {
          const config = statusConfig[status];
          const StatusIcon = config.icon;
          const statusTasks =
            status === "todo" ? todoTasks : groupedTasks[status];

          if (status === "todo" && statusTasks.length > 0) {
            return (
              <AccordionItem key={status} value={status}>
                <AccordionTrigger className="p-2 hover:no-underline">
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon size={14} className={config.text} />
                      <span className={`text-sm font-medium ${config.text}`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-muted-foreground/60 tabular-nums">
                        {statusTasks.length}
                      </span>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="mr-2 h-6 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateTask();
                      }}
                    >
                      <IconPlus size={12} />
                    </Button>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2 px-3">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={statusTasks.map((t) => t._id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {statusTasks.map((task, index) => (
                        <SortableTaskWrapper
                          key={task._id}
                          task={task}
                          selectedTaskId={selectedTaskId}
                          onSelectTask={onSelectTask}
                          hasError={errorTaskIdSet.has(task._id)}
                          basePath={basePath}
                          projectNumId={projectNumId}
                          index={index}
                          firstPaint={firstPaint.current}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </AccordionContent>
              </AccordionItem>
            );
          }

          return (
            <AccordionItem key={status} value={status}>
              <AccordionTrigger className="p-2 hover:no-underline">
                <div
                  className={`flex items-center gap-1.5 ${status === "todo" ? "flex-1 justify-between" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <StatusIcon size={14} className={config.text} />
                    <span className={`text-sm font-medium ${config.text}`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground/60 tabular-nums">
                      {statusTasks.length}
                    </span>
                  </div>
                  {status === "todo" && (
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="mr-2 h-6 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateTask();
                      }}
                    >
                      <IconPlus size={12} />
                    </Button>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2 px-3">
                {statusTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No tasks</p>
                ) : scrollParent ? (
                  <Virtuoso
                    customScrollParent={scrollParent}
                    totalCount={statusTasks.length}
                    overscan={200}
                    itemContent={(index) => {
                      const task = statusTasks[index];
                      return (
                        <ListEnter
                          index={index}
                          firstPaint={firstPaint.current}
                          className="pb-2"
                        >
                          <QuickTaskCard
                            id={task._id}
                            title={task.title}
                            description={task.description}
                            status={task.status}
                            isAgentActive={isTaskAgentActive(task)}
                            hasError={errorTaskIdSet.has(task._id)}
                            sandboxStatus={task.reviewTaskSandboxStatus}
                            numId={task.numId}
                            projectNumId={projectNumId}
                            tags={task.tags}
                            createdAt={task._creationTime}
                            scheduledAt={task.scheduledAt}
                            href={
                              entityPathSegment(task)
                                ? `${basePath}/quick-tasks/${entityPathSegment(task)}`
                                : `${basePath}/quick-tasks`
                            }
                            isActive={selectedTaskId === task._id}
                            onClick={(event) => {
                              event.preventDefault();
                              onSelectTask(task._id);
                            }}
                            assignedTo={task.assignedTo}
                            model={task.model}
                            providerAccountId={task.providerAccountId}
                            projectId={task.projectId}
                            repoId={task.repoId}
                          />
                        </ListEnter>
                      );
                    }}
                  />
                ) : null}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
