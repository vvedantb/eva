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
import { IconCheck } from "@tabler/icons-react";
import { firstNameByUserId } from "@eva/shared";
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
  onSelectTask: (id: Id<"agentTasks">) => void;
  failedTaskIds: ReadonlySet<string>;
  /** Open asks and reports by task id (`useProjectTaskNotes`). */
  notesByTask: ReadonlyMap<string, ProjectTaskNotes>;
  basePath: string;
  projectNumId?: number;
  homeRepoId: Id<"githubRepos">;
  reposById: ReadonlyMap<string, RepoAppMarkRepo>;
  canContribute: boolean;
  /** Feedback authors' first names, by user id (the Triage origin line). */
  authorNames: ReadonlyMap<string, string>;
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
      authorName={
        task.row.createdBy === undefined
          ? undefined
          : context.authorNames.get(task.row.createdBy)
      }
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
  onSelectTask: (id: Id<"agentTasks">) => void;
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
  onSelectTask,
  projectNumId,
  homeRepoId,
  canContribute,
}: ProjectTaskListPanelProps) {
  const { basePath } = useRepo();
  const firstPaint = useFirstPaintGate();
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [isApproving, setIsApproving] = useState(false);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const repos = useQuery(api.githubRepos.list, {});
  const reposById = new Map<string, RepoAppMarkRepo>(
    (repos ?? []).map((repo) => [repo._id, repo]),
  );

  const notesByTask = useProjectTaskNotes(projectId);
  const sections = projectTaskStatusSections(tasks, failedTaskIds);
  const toApprove = unapprovedTodoTaskIds(tasks);
  const feedbackAuthorIds = [
    ...new Set(
      tasks.flatMap((task) =>
        task.origin === "feedback" && task.createdBy !== undefined
          ? [task.createdBy]
          : [],
      ),
    ),
  ];
  const authors = useQuery(
    api.users.getMany,
    feedbackAuthorIds.length > 0 ? { ids: feedbackAuthorIds } : "skip",
  );

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

  // Groups come and go with their tasks, so the open set is derived: each
  // group's default, flipped where the reader toggled it.
  const expandedKeys = sections
    .filter((section) => section.defaultOpen !== toggled.has(section.status))
    .map((section) => section.status);
  const setExpandedKeys = (keys: string[]) => {
    const open = new Set(keys);
    setToggled(
      new Set(
        sections
          .filter((section) => section.defaultOpen !== open.has(section.status))
          .map((section) => section.status),
      ),
    );
  };

  if (sections.length === 0) {
    return <p className="px-5 py-2 text-sm text-muted-foreground">No tasks</p>;
  }

  const context: RowContext = {
    onSelectTask,
    failedTaskIds,
    notesByTask,
    basePath,
    projectNumId,
    homeRepoId,
    reposById,
    canContribute,
    authorNames: firstNameByUserId(authors ?? []),
  };

  // Feedback and coordinator proposals wait in Triage: its header approves them all.
  const triageActions =
    canContribute && toApprove.length > 0 ? (
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
        Approve all
      </Button>
    ) : undefined;

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
        value={expandedKeys}
        onValueChange={setExpandedKeys}
      >
        {sections.map(({ status, tasks: sectionTasks }) => (
          <AccordionItem key={status} value={status}>
            <AccordionTrigger className="p-2 hover:no-underline">
              <SectionHeader
                status={status}
                count={sectionTasks.length}
                actions={status === "triage" ? triageActions : undefined}
              />
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-1 px-3">
              {scrollParent ? (
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
