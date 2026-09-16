"use client";

import { useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useQuickTaskFilters } from "@/routes/_repo/$owner/$repo/quick-tasks/_utils";
import { useRepo } from "@/lib/contexts/RepoContext";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";
import {
  Button,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Spinner,
  ListProvider,
  ListGroup,
  ListHeader,
  ListItems,
  ListItem,
  toast,
  type ListDragEndEvent,
} from "@eva/ui";
import { IconChevronRight, IconPlayerPlay } from "@tabler/icons-react";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import {
  statusConfig,
  TASK_STATUSES,
  type DisplayTaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import { ListEnter, useFirstPaintGate } from "@/lib/components/ui/ListEnter";
import { isTaskAgentActive, QuickTaskCard } from "./QuickTaskCard";
import type { SelectionToggleOptions } from "./selectionRange";
import { entityPathSegment } from "@/lib/numId";
import { RunAllDialog } from "./RunAllDialog";

type Task = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];

function parseDragEvent(event: ListDragEndEvent) {
  const source = event.active.data.current?.parent;
  if (typeof source !== "string" || !event.over) return null;
  return {
    itemId: String(event.active.id),
    source,
    target: String(event.over.id),
  };
}

interface QuickTasksListViewProps {
  tasks: Task[];
  projectNames: Map<string, string>;
  isSelecting: boolean;
  selectedIds: Set<Id<"agentTasks">>;
  onToggleSelect: (
    id: Id<"agentTasks">,
    options?: SelectionToggleOptions<Id<"agentTasks">>,
  ) => void;
  selectedTaskId?: string | null;
  /**
   * Fires when a card is opened (not in selection mode). The master/detail
   * caller uses it to bring the detail pane forward on a phone, which the URL
   * alone cannot express when the tapped task is the one already open.
   */
  onOpenTask?: (id: Id<"agentTasks">) => void;
}

export function QuickTasksListView({
  tasks: externalTasks,
  projectNames,
  isSelecting,
  selectedIds,
  onToggleSelect,
  selectedTaskId,
  onOpenTask,
}: QuickTasksListViewProps) {
  const { repoId, basePath, owner, name } = useRepo();
  const firstPaint = useFirstPaintGate();
  const currentUserId = useQuery(api.auth.me);
  const groupedCodebases = useQuery(api.githubRepos.listGroupedByCodebase);
  const users = useQuery(api.users.listAll);
  const projectsList = useQuery(api.projects.list, { repoId });
  const projectNumIds = new Map(
    (projectsList ?? []).flatMap((project) =>
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
          task._id === args.id ? { ...task, status: args.status } : task,
        ),
      );
    }
  });
  const startExecution = useMutation(api.agentTasks.startExecution);

  const taskIds = externalTasks.map((t) => t._id);
  const errorTaskIds = useQuery(api.agentRuns.getTaskIdsWithLatestRunError, {
    repoId,
    taskIds,
  });
  const errorTaskIdSet = new Set(errorTaskIds ?? []);

  const [isRunningAll, setIsRunningAll] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const altHeld = useAltHeld();
  const [openSections, setOpenSections] = useState<Set<DisplayTaskStatus>>(
    () => new Set(TASK_STATUSES),
  );

  const [{ q, statuses }] = useQuickTaskFilters();
  const searchQuery = q;
  const visibleStatuses = new Set(statuses);

  // Respect the sort order applied by QuickTasksClient (e.g. by latest run).
  // Re-sorting here would override the user's chosen sort.
  const tasks = externalTasks;

  const filteredTasks = (() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query),
    );
  })();

  const tasksByStatus = (() => {
    const result: Partial<Record<DisplayTaskStatus, Task[]>> = {};
    for (const status of TASK_STATUSES) {
      result[status] = filteredTasks.filter((t) => t.status === status);
    }
    return result;
  })();

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const ownedTodoTasks = todoTasks.filter((t) => t.createdBy === currentUserId);
  const skippedCount = todoTasks.length - ownedTodoTasks.length;

  const toggleSection = (status: DisplayTaskStatus) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleDragEnd = async (event: ListDragEndEvent) => {
    const data = parseDragEvent(event);
    if (!data) return;
    if (data.source === data.target) return;

    const targetStatus = TASK_STATUSES.find((s) => s === data.target);
    if (!targetStatus) return;

    const task = tasks.find((t) => t._id === data.itemId);
    if (!task) return;

    try {
      await updateStatus({ id: task._id, status: targetStatus });
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Could not change the task status. Try again.");
    }
  };

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

  const { scrollParent, scrollRef } = usePersistedScrollParent(
    `${owner}/${name}/quick-tasks/list`,
  );

  return (
    <>
      <ListProvider
        onDragEnd={handleDragEnd}
        className="flex-1 min-h-0 gap-2 sm:gap-3"
      >
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar space-y-1 pb-2"
        >
          {TASK_STATUSES.flatMap((status) => {
            if (!visibleStatuses.has(status)) return [];
            const cfg = statusConfig[status];
            const items = tasksByStatus[status] ?? [];
            // Shift-click spans this section only — the visible order of the
            // group the click landed in, not the whole flattened list.
            const sectionIds = items.map((t) => t._id);
            const Icon = cfg.icon;

            return [
              <Collapsible
                key={status}
                open={openSections.has(status)}
                onOpenChange={() => toggleSection(status)}
              >
                <ListGroup id={status}>
                  <ListHeader>
                    <div className="flex items-center sticky top-0 z-10 bg-background pb-1.5 pt-0.5">
                      <CollapsibleTrigger asChild>
                        <button className="flex flex-1 items-center gap-2 rounded-lg px-2 py-3 sm:px-3 sm:py-2 text-left transition-colors hover:bg-muted/50 min-h-[44px]">
                          <IconChevronRight
                            size={14}
                            className={`text-muted-foreground transition-transform duration-[var(--motion-base)] ${
                              openSections.has(status) ? "rotate-90" : ""
                            }`}
                          />
                          <Icon size={14} className={cfg.text} />
                          <span className={`text-sm font-medium ${cfg.text}`}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-muted-foreground/60 tabular-nums">
                            {items.length}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      {status === "todo" && todoTasks.length > 0 && (
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
                          className="mr-2 min-h-[36px]"
                        >
                          {isRunningAll ? (
                            <Spinner size="sm" />
                          ) : (
                            <IconPlayerPlay size={14} />
                          )}
                          <span className="hidden sm:inline">Run All</span>
                          <span className="sm:hidden">Run</span>
                          <ConfirmSkipHint />
                        </Button>
                      )}
                    </div>
                  </ListHeader>
                  <CollapsibleContent>
                    {items.length === 0 ? (
                      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                        No tasks
                      </div>
                    ) : (
                      <ListItems className="pr-1.5 pb-1.5">
                        {scrollParent && (
                          <Virtuoso
                            customScrollParent={scrollParent}
                            totalCount={items.length}
                            overscan={200}
                            itemContent={(index) => {
                              const task = items[index];
                              return (
                                <ListItem
                                  id={task._id}
                                  name={task.title}
                                  index={index}
                                  parent={status}
                                  className="pb-1.5"
                                >
                                  <ListEnter
                                    index={index}
                                    firstPaint={firstPaint.current}
                                  >
                                  <QuickTaskCard
                                    id={task._id}
                                    title={task.title}
                                    description={task.description}
                                    status={task.status}
                                    isAgentActive={isTaskAgentActive(task)}
                                    priority={task.priority}
                                    numId={task.numId}
                                    projectNumId={
                                      task.projectId
                                        ? projectNumIds.get(task.projectId)
                                        : undefined
                                    }
                                    hasError={errorTaskIdSet.has(task._id)}
                                    sandboxStatus={task.reviewTaskSandboxStatus}
                                    scheduledAt={task.scheduledAt}
                                    tags={task.tags}
                                    createdByUser={users?.find(
                                      (u) => u._id === task.createdBy,
                                    )}
                                    createdAt={task.createdAt}
                                    projectName={
                                      task.projectId
                                        ? projectNames.get(task.projectId)
                                        : undefined
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
                                            onToggleSelect(task._id, {
                                              range: event.shiftKey,
                                              orderedIds: sectionIds,
                                            });
                                          }
                                        : onOpenTask
                                          ? () => onOpenTask(task._id)
                                          : undefined
                                    }
                                    isSelecting={isSelecting}
                                    isSelected={selectedIds.has(task._id)}
                                    isActive={selectedTaskId === task._id}
                                    onToggleSelect={(event) =>
                                      onToggleSelect(task._id, {
                                        range: event.shiftKey,
                                        orderedIds: sectionIds,
                                      })
                                    }
                                    groupedCodebases={
                                      groupedCodebases ?? undefined
                                    }
                                    assignedTo={task.assignedTo}
                                    model={task.model}
                                    providerAccountId={task.providerAccountId}
                                    projectId={task.projectId}
                                    repoId={task.repoId ?? repoId}
                                    users={users ?? undefined}
                                    currentUserId={currentUserId ?? undefined}
                                    projects={projectsList ?? undefined}
                                  />
                                  </ListEnter>
                                </ListItem>
                              );
                            }}
                          />
                        )}
                      </ListItems>
                    )}
                  </CollapsibleContent>
                </ListGroup>
              </Collapsible>,
            ];
          })}
        </div>
      </ListProvider>
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
