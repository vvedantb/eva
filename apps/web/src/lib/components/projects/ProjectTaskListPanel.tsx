"use client";

import type { Id } from "@eva/backend";
import { api } from "@eva/backend";
import type {
  NeedsYouReason,
  ProjectTaskStage,
} from "@eva/shared/projectStatus";
import {
  projectTaskStageSections,
  unapprovedTodoTaskIds,
  type ProjectTaskNotes,
} from "@eva/shared/projectView";
import { useState, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Virtuoso } from "react-virtuoso";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
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
  ListEnter,
  useFirstPaintGate,
} from "@vvedantb/ui";
import { IconCheck, IconGripVertical, IconPlus } from "@tabler/icons-react";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { projectTaskStageConfig } from "./ProjectPhaseBadge";
import { ProjectTaskRow } from "./_components/ProjectTaskRow";
import {
  useProjectTaskNotes,
  type ProjectTaskListRow,
} from "./useProjectStatus";

type Task = ProjectTaskListRow;
type TaskWithReason = {
  row: Task;
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
};

/** What every row of the list shares. */
interface RowContext {
  selectedTaskId: Id<"agentTasks"> | null;
  onSelectTask: (id: Id<"agentTasks">) => void;
  failedTaskIds: ReadonlySet<string>;
  /** Open asks and reports by task id (`useProjectTaskNotes`). */
  notesByTask: ReadonlyMap<string, ProjectTaskNotes>;
  basePath: string;
  projectNumId?: number;
  homeRepoId: Id<"githubRepos">;
  reposById: ReadonlyMap<string, RepoAppMarkRepo>;
  canContribute: boolean;
}

function SortableTaskWrapper({
  task,
  context,
  index,
  firstPaint,
}: {
  task: TaskWithReason;
  context: RowContext;
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
  } = useSortable({ id: task.row._id });

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
        aria-label={`Reorder ${task.row.title}`}
        className="max-sm:hit-target cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0 max-sm:p-1.5"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={14} aria-hidden />
      </button>
      <div className="flex-1 min-w-0">
        <ListEnter index={index} firstPaint={firstPaint}>
          <ProjectTaskRowFor task={task} context={context} />
        </ListEnter>
      </div>
    </div>
  );
}

function ProjectTaskRowFor({
  task,
  context,
}: {
  task: TaskWithReason;
  context: RowContext;
}) {
  return (
    <ProjectTaskRow
      task={task.row}
      needsYou={task.needsYou}
      waitingForCoordinator={task.waitingForCoordinator}
      notes={context.notesByTask.get(task.row._id)}
      hasError={context.failedTaskIds.has(task.row._id)}
      selectedTaskId={context.selectedTaskId}
      onSelectTask={context.onSelectTask}
      basePath={context.basePath}
      projectNumId={context.projectNumId}
      homeRepoId={context.homeRepoId}
      reposById={context.reposById}
      canContribute={context.canContribute}
    />
  );
}

function SectionHeader({
  stage,
  count,
  actions,
}: {
  stage: ProjectTaskStage;
  count: number;
  actions?: ReactNode;
}) {
  const config = projectTaskStageConfig[stage];
  const StageIcon = config.icon;
  return (
    <div className="flex flex-1 items-center justify-between">
      <div className="flex items-center gap-1.5">
        <StageIcon size={14} className={config.text} />
        <span className={`text-sm font-medium ${config.text}`}>
          {config.label}
        </span>
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {count}
        </span>
      </div>
      {actions ? (
        <div className="mr-2 flex items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  );
}

interface ProjectTaskListPanelProps {
  projectId: Id<"projects">;
  tasks: Task[];
  /** Tasks whose latest run failed (`useProjectTaskStatus`). */
  failedTaskIds: ReadonlySet<string>;
  selectedTaskId: Id<"agentTasks"> | null;
  onSelectTask: (id: Id<"agentTasks">) => void;
  /** New task for a contributor, feedback for a viewer. */
  onCreateTask: () => void;
  projectNumId?: number;
  /** The project's repo; a task in another repo shows its repo. */
  homeRepoId: Id<"githubRepos">;
  /** The caller may approve, cancel, reorder and run (`callerRole`). */
  canContribute: boolean;
}

export function ProjectTaskListPanel({
  projectId,
  tasks,
  failedTaskIds,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  projectNumId,
  homeRepoId,
  canContribute,
}: ProjectTaskListPanelProps) {
  const { basePath } = useRepo();
  const firstPaint = useFirstPaintGate();
  const [localTodoOrder, setLocalTodoOrder] = useState<
    Id<"agentTasks">[] | null
  >(null);
  const reorderTasks = useMutation(api.agentTasks.reorderProjectTasks);
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [isApproving, setIsApproving] = useState(false);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const repos = useQuery(api.githubRepos.list, {});
  const reposById = new Map<string, RepoAppMarkRepo>(
    (repos ?? []).map((repo) => [repo._id, repo]),
  );

  const notesByTask = useProjectTaskNotes(projectId);
  const sections = projectTaskStageSections(tasks, failedTaskIds);
  const tasksFor = (stage: ProjectTaskStage) =>
    sections.find((section) => section.stage === stage)?.tasks ?? [];

  let todoTasks = tasksFor("todo");
  if (localTodoOrder) {
    const taskMap = new Map(todoTasks.map((t) => [t.row._id, t]));
    const orderSet = new Set(localTodoOrder);
    const ordered: TaskWithReason[] = [];
    for (const id of localTodoOrder) {
      const task = taskMap.get(id);
      if (task) ordered.push(task);
    }
    for (const task of tasksFor("todo")) {
      if (!orderSet.has(task.row._id)) ordered.push(task);
    }
    todoTasks = ordered;
  }
  const toApprove = unapprovedTodoTaskIds(tasks);

  const approveAll = async () => {
    setIsApproving(true);
    await withMutationToast(
      approveTasks({ projectId, taskIds: toApprove }),
      toApprove.length === 1 ? "Task approved" : "Tasks approved",
      "Couldn't approve the tasks",
      "project-approve",
    ).catch(() => undefined);
    setIsApproving(false);
  };

  // Mouse arms on distance, touch on a hold — a single PointerSensor cannot do
  // both, and distance-based activation on touch loses the pointer to the list's
  // own scroll, so reorder was impossible on a phone.
  const sensors = useDragSensors({ sortable: true });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = todoTasks.findIndex((t) => t.row._id === active.id);
    const newIndex = todoTasks.findIndex((t) => t.row._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const currentOrder = todoTasks.map((t) => t.row._id);
    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    setLocalTodoOrder(newOrder);

    reorderTasks({ projectId, taskIds: newOrder }).then(() => {
      setLocalTodoOrder(null);
    });
  };

  const defaultExpandedKeys = sections
    .filter((section) => section.defaultOpen)
    .map((section) => section.stage);

  const context: RowContext = {
    selectedTaskId,
    onSelectTask,
    failedTaskIds,
    notesByTask,
    basePath,
    projectNumId,
    homeRepoId,
    reposById,
    canContribute,
  };

  const todoActions = (
    <>
      {canContribute && toApprove.length > 0 ? (
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={isApproving}
          onClick={(e) => {
            e.stopPropagation();
            void approveAll();
          }}
        >
          <IconCheck size={12} aria-hidden />
          Approve
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="outline"
        className="h-6 text-xs"
        aria-label={canContribute ? "New task" : "Feedback"}
        onClick={(e) => {
          e.stopPropagation();
          onCreateTask();
        }}
      >
        <IconPlus size={12} />
      </Button>
    </>
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
        {sections.map(({ stage, tasks: sectionTasks }) => {
          const stageTasks = stage === "todo" ? todoTasks : sectionTasks;
          return (
            <AccordionItem key={stage} value={stage}>
              <AccordionTrigger className="p-2 hover:no-underline">
                <SectionHeader
                  stage={stage}
                  count={stageTasks.length}
                  actions={stage === "todo" ? todoActions : undefined}
                />
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2 px-3">
                {stageTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No tasks</p>
                ) : stage === "todo" && canContribute ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={stageTasks.map((t) => t.row._id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {stageTasks.map((task, index) => (
                        <SortableTaskWrapper
                          key={task.row._id}
                          task={task}
                          context={context}
                          index={index}
                          firstPaint={firstPaint.current}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : scrollParent ? (
                  <Virtuoso
                    customScrollParent={scrollParent}
                    totalCount={stageTasks.length}
                    overscan={200}
                    itemContent={(index) => (
                      <ListEnter
                        index={index}
                        firstPaint={firstPaint.current}
                        className="pb-2"
                      >
                        <ProjectTaskRowFor
                          task={stageTasks[index]}
                          context={context}
                        />
                      </ListEnter>
                    )}
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
