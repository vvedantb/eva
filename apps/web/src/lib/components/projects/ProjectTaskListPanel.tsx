"use client";

import type { Id } from "@eva/backend";
import { api } from "@eva/backend";
import { firstNameByUserId, repoDisplayLabel } from "@eva/shared";
import {
  PROJECT_TASK_DISPLAY_STATUS_LABELS,
  projectTaskPullRequests,
  projectTaskStatusSections,
  projectTaskSummaryLine,
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
import { IconChevronRight } from "@tabler/icons-react";
import type { RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { ProjectTaskRow } from "./_components/ProjectTaskRow";
import { ProjectTaskPrRow } from "./_components/ProjectTaskPrRow";
import {
  useProjectTaskNotes,
  type ProjectTaskListRow,
} from "./useProjectStatus";

type Task = ProjectTaskListRow;
type ViewedTask = { row: Task; view: ProjectTaskView };

const NO_OPEN_TASKS: ReadonlySet<string> = new Set();

const PULL_REQUESTS = "pull_requests";

interface RowContext {
  onSelectTask: (id: Id<"agentTasks">) => void;
  openTaskIds: ReadonlySet<string>;
  failedTaskIds: ReadonlySet<string>;
  notesByTask: ReadonlyMap<string, ProjectTaskNotes>;
  basePath: string;
  homeRepoId: Id<"githubRepos">;
  reposById: ReadonlyMap<string, RepoAppMarkRepo>;
  authorNames: ReadonlyMap<string, string>;
  numIdOf: (taskId: string) => number | undefined;
  readOnly: boolean;
}

function ProjectTaskRowFor({
  task: { row, view },
  context,
}: {
  task: ViewedTask;
  context: RowContext;
}) {
  const otherRepo =
    row.repoId !== undefined && row.repoId !== context.homeRepoId
      ? context.reposById.get(row.repoId)
      : undefined;
  return (
    <ProjectTaskRow
      task={row}
      view={view}
      open={context.openTaskIds.has(row._id)}
      line={projectTaskSummaryLine(row, view, {
        open: context.openTaskIds.has(row._id),
        notes: context.notesByTask.get(row._id),
        failed: context.failedTaskIds.has(row._id),
        authorName:
          row.createdBy === undefined
            ? undefined
            : context.authorNames.get(row.createdBy),
        otherRepoLabel: otherRepo ? repoDisplayLabel(otherRepo) : undefined,
        numIdOf: context.numIdOf,
      })}
      onSelectTask={context.onSelectTask}
      basePath={context.basePath}
      readOnly={context.readOnly}
    />
  );
}

function GroupHeader({
  label,
  count,
  actions,
}: {
  label: string;
  count: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 rounded-control bg-muted/60 pr-1">
      <AccordionTrigger
        classes={{
          header: "flex min-w-0 flex-1",
          trigger:
            "group/section flex flex-1 items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        }}
        icon={
          <IconChevronRight
            size={12}
            aria-hidden
            className="shrink-0 transition-transform duration-150 group-data-[state=open]/section:rotate-90"
          />
        }
      >
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground/60">{count}</span>
      </AccordionTrigger>
      {actions}
    </div>
  );
}

interface ProjectTaskListPanelProps {
  projectId: Id<"projects">;
  tasks: Task[];
  archivedTasks: Task[];
  readOnly: boolean;
  failedTaskIds: ReadonlySet<string>;
  onSelectTask: (id: Id<"agentTasks">) => void;
  openTaskIds?: ReadonlySet<string>;
  homeRepoId: Id<"githubRepos">;
}

/**
 * The project's tasks as flat rows under muted group headers: Triage,
 * Working, Blocked, Idle, Archived (`projectTaskStatusSections`), then the
 * tasks' Pull requests. Archived starts closed.
 */
export function ProjectTaskListPanel({
  projectId,
  tasks,
  archivedTasks,
  readOnly,
  failedTaskIds,
  onSelectTask,
  openTaskIds = NO_OPEN_TASKS,
  homeRepoId,
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
  const numIdById = new Map(
    [...tasks, ...archivedTasks].map((task) => [String(task._id), task.numId]),
  );
  const sections = projectTaskStatusSections(
    tasks,
    failedTaskIds,
    archivedTasks,
  );
  const pullRequests = projectTaskPullRequests(tasks);
  const toApprove = unapprovedTodoTaskIds(tasks);
  const triageAuthorIds = [
    ...new Set(
      (
        sections.find((section) => section.status === "triage")?.tasks ?? []
      ).flatMap(({ row }) =>
        row.createdBy !== undefined ? [row.createdBy] : [],
      ),
    ),
  ];
  const authors = useQuery(
    api.users.getMany,
    triageAuthorIds.length > 0 ? { ids: triageAuthorIds } : "skip",
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

  const groups = [
    ...sections.map((section) => ({
      key: section.status,
      defaultOpen: section.defaultOpen,
    })),
    ...(pullRequests.length > 0
      ? [{ key: PULL_REQUESTS, defaultOpen: true }]
      : []),
  ];
  const expandedKeys = groups
    .filter((group) => group.defaultOpen !== toggled.has(group.key))
    .map((group) => group.key);
  const setExpandedKeys = (keys: string[]) => {
    const open = new Set(keys);
    setToggled(
      new Set(
        groups
          .filter((group) => group.defaultOpen !== open.has(group.key))
          .map((group) => group.key),
      ),
    );
  };

  if (sections.length === 0) {
    return <p className="px-5 py-2 text-sm text-muted-foreground">No tasks</p>;
  }

  const context: RowContext = {
    onSelectTask,
    openTaskIds,
    failedTaskIds,
    notesByTask,
    basePath,
    homeRepoId,
    reposById,
    authorNames: firstNameByUserId(authors ?? []),
    numIdOf: (taskId) => numIdById.get(taskId),
    readOnly,
  };

  const triageActions =
    !readOnly && toApprove.length > 0 ? (
      <Button
        size="xs"
        variant="ghost"
        disabled={isApproving}
        onClick={() => void approveAll()}
      >
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
        className="px-3 pb-3"
        value={expandedKeys}
        onValueChange={setExpandedKeys}
      >
        {sections.map(({ status, tasks: sectionTasks }) => (
          <AccordionItem key={status} value={status} className="not-first:mt-2">
            <GroupHeader
              label={PROJECT_TASK_DISPLAY_STATUS_LABELS[status]}
              count={sectionTasks.length}
              actions={status === "triage" ? triageActions : undefined}
            />
            <AccordionContent className="pt-1 pb-0">
              {scrollParent ? (
                <Virtuoso
                  customScrollParent={scrollParent}
                  totalCount={sectionTasks.length}
                  overscan={200}
                  itemContent={(index) => (
                    <ListEnter index={index} firstPaint={firstPaint.current}>
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
        {pullRequests.length > 0 ? (
          <AccordionItem value={PULL_REQUESTS} className="not-first:mt-2">
            <GroupHeader label="Pull requests" count={pullRequests.length} />
            <AccordionContent className="pt-1 pb-0">
              {pullRequests.map((task) => (
                <ProjectTaskPrRow
                  key={`${task._id}:${task.prUrl}`}
                  task={task}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        ) : null}
      </Accordion>
    </div>
  );
}
