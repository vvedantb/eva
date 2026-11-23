"use client";

import type { Id } from "@eva/backend";
import { api } from "@eva/backend";
import type { ProjectTaskDisplayStatus } from "@eva/shared/projectStatus";
import {
  projectTaskStatusSections,
  unapprovedTodoTaskIds,
  type ProjectTaskNotes,
  type ProjectTaskView,
} from "@eva/shared/projectView";
import { useState, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Virtuoso } from "react-virtuoso";
import { useMutation } from "convex/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
  ListEnter,
  useFirstPaintGate,
} from "@vvedantb/ui";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { projectTaskDisplayStatusConfig } from "./ProjectPhaseBadge";
import { ProjectTaskRow } from "./_components/ProjectTaskRow";
import {
  useProjectTaskNotes,
  type ProjectTaskListRow,
} from "./useProjectStatus";

type Task = ProjectTaskListRow;
type ViewedTask = { row: Task; view: ProjectTaskView };

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

function ProjectTaskRowFor({
  task,
  context,
}: {
  task: ViewedTask;
  context: RowContext;
}) {
  return (
    <ProjectTaskRow
      task={task.row}
      view={task.view}
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
  status,
  count,
  actions,
}: {
  status: ProjectTaskDisplayStatus;
  count: number;
  actions?: ReactNode;
}) {
  const config = projectTaskDisplayStatusConfig[status];
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
  /** The caller may approve, cancel and run (`callerRole`). */
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
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [isApproving, setIsApproving] = useState(false);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const repos = useQuery(api.githubRepos.list, {});
  const reposById = new Map<string, RepoAppMarkRepo>(
    (repos ?? []).map((repo) => [repo._id, repo]),
  );

  const notesByTask = useProjectTaskNotes(projectId);
  const sections = projectTaskStatusSections(tasks, failedTaskIds);
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

  const defaultExpandedKeys = sections
    .filter((section) => section.defaultOpen)
    .map((section) => section.status);

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

  // New and unapproved tasks wait in Blocked, so its header carries Approve and "+".
  const blockedActions = (
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
        {sections.map(({ status, tasks: sectionTasks }) => (
          <AccordionItem key={status} value={status}>
            <AccordionTrigger className="p-2 hover:no-underline">
              <SectionHeader
                status={status}
                count={sectionTasks.length}
                actions={status === "blocked" ? blockedActions : undefined}
              />
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-1 px-3">
              {sectionTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No tasks</p>
              ) : scrollParent ? (
                <Virtuoso
                  customScrollParent={scrollParent}
                  totalCount={sectionTasks.length}
                  overscan={200}
                  itemContent={(index) => (
                    <ListEnter
                      index={index}
                      firstPaint={firstPaint.current}
                      className="pb-1"
                    >
                      <ProjectTaskRowFor
                        task={sectionTasks[index]}
                        context={context}
                      />
                    </ListEnter>
                  )}
                />
              ) : null}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
