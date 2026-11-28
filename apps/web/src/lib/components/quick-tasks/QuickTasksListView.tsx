"use client";

import { useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, taskScheduledAt } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  useQuickTaskFilters,
  useQuickTaskTodoDrafts,
} from "@/routes/_repo/$owner/$repo/quick-tasks/_utils";
import { useRepo } from "@/lib/contexts/RepoContext";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";
import {
  Button,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Spinner,
  SortableListProvider,
  SortableListGroup,
  SortableListHeader,
  SortableListItems,
  SortableListItem,
  ConfirmSkipHint,
  skipConfirmTitle,
  ListEnter,
  useFirstPaintGate,
} from "@vvedantb/ui";
import type { SortableListDragEndEvent } from "@vvedantb/ui";
import { IconChevronRight, IconPlayerPlay } from "@tabler/icons-react";
import {
  statusConfig,
  TASK_STATUSES,
  type DisplayTaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import { QuickTaskCard } from "./QuickTaskCard";
import { QuickTaskDraftRow } from "./QuickTaskDraftRow";
import type { SelectionToggleOptions } from "./selectionRange";
import { entityPathSegment } from "@/lib/numId";
import { RunAllDialog } from "./RunAllDialog";
import { useQuickTaskBoardActions } from "./useQuickTaskBoardActions";

type Task = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];

function parseDragEvent(event: SortableListDragEndEvent) {
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
  isSelecting: boolean;
  selectedIds: Set<Id<"agentTasks">>;
  onToggleSelect: (
    id: Id<"agentTasks">,
    options?: SelectionToggleOptions<Id<"agentTasks">>,
  ) => void;
  selectedTaskId?: string | null;
  onOpenTask?: (id: Id<"agentTasks">) => void;
  archived?: boolean;
}

export function QuickTasksListView({
  tasks: externalTasks,
  isSelecting,
  selectedIds,
  onToggleSelect,
  selectedTaskId,
  onOpenTask,
  archived = false,
}: QuickTasksListViewProps) {
  const { repoId, basePath, owner, name } = useRepo();
  const firstPaint = useFirstPaintGate();
  const groupedCodebases = useQuery(api.githubRepos.listGroupedByCodebase);
  const users = useQuery(api.users.listAll);
  const projectsList = useQuery(api.projects.list, { repoId });
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

  const [openSections, setOpenSections] = useState<Set<DisplayTaskStatus>>(
    () => new Set(TASK_STATUSES),
  );

  const [{ statuses }] = useQuickTaskFilters();
  const liveTodoDrafts = useQuickTaskTodoDrafts(repoId);
  const todoDrafts = archived ? [] : liveTodoDrafts;
  const visibleStatuses = new Set(statuses);

  const tasksByStatus = (() => {
    const result: Partial<Record<DisplayTaskStatus, Task[]>> = {};
    for (const status of TASK_STATUSES) {
      result[status] = tasks.filter((t) => t.status === status);
    }
    return result;
  })();

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

  const handleDragEnd = async (event: SortableListDragEndEvent) => {
    const data = parseDragEvent(event);
    if (!data) return;
    if (data.source === data.target) return;

    const targetStatus = TASK_STATUSES.find((s) => s === data.target);
    if (!targetStatus) return;

    const task = tasks.find((t) => t._id === data.itemId);
    if (!task) return;
    await changeStatus(task._id, targetStatus);
  };

  const { scrollParent, scrollRef } = usePersistedScrollParent(
    `${owner}/${name}/quick-tasks/list`,
  );

  return (
    <>
      <SortableListProvider
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
            const drafts = status === "todo" ? todoDrafts : [];
            const sectionIds = items.map((t) => t._id);
            const Icon = cfg.icon;

            return [
              <Collapsible
                key={status}
                open={openSections.has(status)}
                onOpenChange={() => toggleSection(status)}
              >
                <SortableListGroup id={status}>
                  <SortableListHeader>
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
                            {items.length + drafts.length}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      {status === "todo" && showRunAll && (
                        <Button
                          size="sm"
                          title={skipConfirmTitle("Run All")}
                          onClick={requestRunAll}
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
                  </SortableListHeader>
                  <CollapsibleContent>
                    {drafts.length > 0 ? (
                      <div className="flex flex-col gap-1.5 pr-1.5 pb-1.5">
                        {drafts.map((draft) => (
                          <QuickTaskDraftRow
                            key={draft._id}
                            id={draft._id}
                            title={draft.title}
                            description={draft.description}
                          />
                        ))}
                      </div>
                    ) : null}
                    {items.length === 0 && drafts.length === 0 ? (
                      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                        No tasks
                      </div>
                    ) : items.length === 0 ? null : (
                      <SortableListItems className="pr-1.5 pb-1.5">
                        {scrollParent && (
                          <Virtuoso
                            customScrollParent={scrollParent}
                            totalCount={items.length}
                            overscan={200}
                            itemContent={(index) => {
                              const task = items[index];
                              return (
                                <SortableListItem
                                  id={task._id}
                                  name={task.title}
                                  index={index}
                                  parent={status}
                                  className="pb-1"
                                >
                                  <ListEnter
                                    index={index}
                                    firstPaint={firstPaint.current}
                                  >
                                    <QuickTaskCard
                                      layout="row"
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
                                      sandboxStatus={
                                        task.sandboxStatus
                                      }
                                      scheduledAt={taskScheduledAt(task)}
                                      tags={task.tags}
                                      createdByUser={users?.find(
                                        (u) => u._id === task.createdBy,
                                      )}
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
                                      projectId={task.projectId}
                                      repoId={task.repoId ?? repoId}
                                      users={users ?? undefined}
                                      currentUserId={currentUserId ?? undefined}
                                      projects={projectsList ?? undefined}
                                    />
                                  </ListEnter>
                                </SortableListItem>
                              );
                            }}
                          />
                        )}
                      </SortableListItems>
                    )}
                  </CollapsibleContent>
                </SortableListGroup>
              </Collapsible>,
            ];
          })}
        </div>
      </SortableListProvider>
      <RunAllDialog {...runAllDialog} />
    </>
  );
}
