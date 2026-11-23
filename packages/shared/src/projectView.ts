import type { Doc } from "@eva/backend";
import {
  projectStatus,
  projectTaskNeedsYou,
  projectTaskStage,
  projectTaskWaitsForCoordinator,
  type NeedsYouReason,
  type ProjectStage,
  type ProjectStatus,
  type ProjectTaskFacts,
  type ProjectTaskStage,
} from "./projectStatus";

// How web and phone show a project's derived status (`./projectStatus`) from
// the rows they already load: `agentTasks.listByProject` plus the tasks whose
// latest run failed (`agentRuns.getTaskIdsWithLatestRunError`).

/** Project stages in workflow order: kanban columns and list sections. */
export const PROJECT_STAGES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const satisfies readonly ProjectStage[];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

/** Task stages in workflow order: the project task list sections. */
export const PROJECT_TASK_STAGES = [
  "todo",
  "in_progress",
  "in_review",
  "launched",
  "cancelled",
] as const satisfies readonly ProjectTaskStage[];

export const PROJECT_TASK_STAGE_LABELS: Record<ProjectTaskStage, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  launched: "Launched",
  cancelled: "Cancelled",
};

/** The stage counts a project shows, most finished first. Cancelled is left out. */
export const PROJECT_STAGE_COUNT_ORDER = [
  "launched",
  "in_review",
  "in_progress",
  "todo",
] as const satisfies readonly ProjectTaskStage[];

/** Why a task waits for a person, in a few words. */
export const NEEDS_YOU_LABELS: Record<NeedsYouReason, string> = {
  usage_limit: "Usage limit reached",
  failed: "Run failed",
  stopped: "Run stopped",
  pr_closed: "PR closed",
  approve: "Needs approval",
  dependency_cancelled: "Dependency cancelled",
  review: "Ready for review",
  question: "Question for you",
};

/** A task that asked its coordinator a question and waits for the answer. */
export const WAITING_FOR_COORDINATOR_LABEL = "Waiting for coordinator";

/** The project's coordinator hit its hourly cap of automatic turns. */
export const COORDINATOR_PAUSED_LABEL = "Coordinator paused";

/**
 * The coordinator chat's one-line notice while the hourly cap holds its
 * wake-ups back. A person's message releases them, so the line asks for one
 * only from someone who can send (`canSend`; a viewer cannot).
 */
export function coordinatorPausedTitle(
  maxAutoTurnsPerHour: number,
  canSend: boolean,
): string {
  const title = `${COORDINATOR_PAUSED_LABEL} after ${maxAutoTurnsPerHour} automatic turns this hour.`;
  return canSend ? `${title} Send a message to continue.` : title;
}

/** The fields of an `agentTasks.listByProject` row the status rules read. */
export interface ProjectTaskRow {
  _id: string;
  taskNumber?: number;
  status: Doc<"agentTasks">["status"];
  prState?: Doc<"agentTasks">["prState"];
  approvedAt?: number;
  run?: Doc<"agentTasks">["run"];
  coordinatorRetries?: number;
  /** A task in a repo the caller cannot access: only status fields are set. */
  locked?: boolean;
  /**
   * The server's facts for the task (`listByProject`): the usage limit,
   * dependencies and open ask the row alone does not carry.
   */
  facts?: ProjectTaskFacts;
}

/**
 * One row as the shared rules read it. A row with the server's `facts` uses
 * them as they are. Without them the usage limit, the dependencies and open
 * asks never show here. A locked row counts as approved: its approval is not
 * the caller's to give.
 */
export function projectTaskFactsFromRow(
  row: ProjectTaskRow,
  failed: boolean,
): ProjectTaskFacts {
  if (row.facts !== undefined) return row.facts;
  const runPending = row.run !== undefined;
  return {
    id: row._id,
    taskNumber: row.taskNumber,
    status: row.status,
    prState: row.prState,
    approved: row.locked === true || row.approvedAt !== undefined,
    halted: failed && !runPending ? "failed" : undefined,
    usageLimited: false,
    runPending,
    dependencies: [],
    coordinatorRetries: row.coordinatorRetries,
  };
}

/** The project's derived status from its task rows. */
export function projectStatusFromRows(
  rows: readonly ProjectTaskRow[],
  failedTaskIds: ReadonlySet<string>,
): ProjectStatus {
  return projectStatus(
    rows.map((row) => projectTaskFactsFromRow(row, failedTaskIds.has(row._id))),
  );
}

/**
 * One task's stage, the reason it waits for a person, if any, and whether it
 * waits for its coordinator to answer a question.
 */
export function projectTaskView(
  row: ProjectTaskRow,
  failed: boolean,
): {
  stage: ProjectTaskStage;
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
} {
  const facts = projectTaskFactsFromRow(row, failed);
  return {
    stage: projectTaskStage(facts),
    needsYou: projectTaskNeedsYou(facts),
    waitingForCoordinator: projectTaskWaitsForCoordinator(facts),
  };
}

/** What `listTaskReports` returns for one report or ask. */
export interface ProjectTaskReportRow {
  taskId: string;
  kind: "report" | "ask";
  text: string;
  state: "open" | "answered" | "closed";
  createdAt: number;
}

/** A task's open ask and its open reports, newest report first. */
export interface ProjectTaskNotes {
  ask: string | undefined;
  reports: string[];
}

/**
 * The open ask and open reports of each task, keyed by task id. Answered and
 * closed rows are left out. A report stays open until its task stops.
 */
export function projectTaskNotesByTask(
  rows: readonly ProjectTaskReportRow[],
): ReadonlyMap<string, ProjectTaskNotes> {
  const byTask = new Map<string, ProjectTaskNotes>();
  const newestFirst = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  for (const row of newestFirst) {
    if (row.state !== "open") continue;
    const notes = byTask.get(row.taskId) ?? { ask: undefined, reports: [] };
    if (row.kind === "ask") notes.ask = notes.ask ?? row.text;
    else notes.reports.push(row.text);
    byTask.set(row.taskId, notes);
  }
  return byTask;
}

/**
 * What the projects list reads for each project (`listStatusesForRepo`):
 * the derived stage and counts, how many tasks need a person, and whether
 * the coordinator is paused at its hourly cap.
 */
export interface ProjectListStatus {
  stage: ProjectStage;
  counts: Record<ProjectTaskStage, number>;
  needsYouCount: number;
  coordinatorPaused: boolean;
}

/**
 * Why a project on the list needs a person, in a few words, or undefined
 * when it does not. A paused coordinator comes first: nothing moves until a
 * person writes to it.
 */
export function projectListNeedsYouLabel(
  status: ProjectListStatus,
): string | undefined {
  if (status.coordinatorPaused) return COORDINATOR_PAUSED_LABEL;
  if (status.needsYouCount === 0) return undefined;
  return status.needsYouCount === 1
    ? "1 task needs you"
    : `${status.needsYouCount} tasks need you`;
}

/**
 * Launched tasks out of the tasks still counted (cancelled ones are left
 * out), and the share as a whole percent: the timeline's progress.
 */
export function projectLaunchedShare(
  counts: Record<ProjectTaskStage, number>,
): { launched: number; total: number; percent: number } {
  const total =
    counts.launched + counts.in_review + counts.in_progress + counts.todo;
  return {
    launched: counts.launched,
    total,
    percent: total > 0 ? Math.round((counts.launched / total) * 100) : 0,
  };
}

/** The todo tasks a contributor approves with one Approve. */
export function unapprovedTodoTaskIds<Row extends ProjectTaskRow>(
  rows: readonly Row[],
): Row["_id"][] {
  return rows
    .filter(
      (row) =>
        row.locked !== true &&
        row.status === "todo" &&
        row.approvedAt === undefined,
    )
    .map((row) => row._id);
}

/**
 * The progress bar's coloured parts, in `PROJECT_TASK_STAGES` order: each
 * non-empty stage's share of the tasks and where it starts, both from 0 to 1.
 */
export function projectStageSegments(
  status: Pick<ProjectStatus, "counts">,
): Array<{ stage: ProjectTaskStage; ratio: number; offset: number }> {
  const total = PROJECT_TASK_STAGES.reduce(
    (sum, stage) => sum + status.counts[stage],
    0,
  );
  if (total === 0) return [];
  const segments: Array<{
    stage: ProjectTaskStage;
    ratio: number;
    offset: number;
  }> = [];
  let offset = 0;
  const order: readonly ProjectTaskStage[] = [
    ...PROJECT_STAGE_COUNT_ORDER,
    "cancelled",
  ];
  for (const stage of order) {
    const count = status.counts[stage];
    if (count === 0) continue;
    const ratio = count / total;
    segments.push({ stage, ratio, offset });
    offset += ratio;
  }
  return segments;
}

/** The fields `projectTaskStageSections` reads from an `agentTasks.listByProject` row. */
export interface SectionableProjectTaskRow extends ProjectTaskRow {
  createdAt: number;
  lastRunStartedAt?: number;
}

/**
 * A project's task list: one section per task stage in workflow order, each
 * row with the reason it waits for a person or its coordinator. To Do keeps the project's order
 * (`taskNumber`); every other section puts the latest run first, else the
 * newest task. A section starts open when it has tasks and is not Launched
 * or Cancelled.
 */
export function projectTaskStageSections<Row extends SectionableProjectTaskRow>(
  rows: readonly Row[],
  failedTaskIds: ReadonlySet<string>,
): Array<{
  stage: ProjectTaskStage;
  tasks: Array<{
    row: Row;
    needsYou: NeedsYouReason | undefined;
    waitingForCoordinator: boolean;
  }>;
  defaultOpen: boolean;
}> {
  const viewed = rows.map((row) => ({
    row,
    ...projectTaskView(row, failedTaskIds.has(row._id)),
  }));
  const lastRun = (row: Row) => row.lastRunStartedAt ?? row.createdAt;
  return PROJECT_TASK_STAGES.map((stage) => {
    const matching = viewed
      .filter((task) => task.stage === stage)
      .map(({ row, needsYou, waitingForCoordinator }) => ({
        row,
        needsYou,
        waitingForCoordinator,
      }));
    const tasks =
      stage === "todo"
        ? matching
        : matching.sort((a, b) => lastRun(b.row) - lastRun(a.row));
    return {
      stage,
      tasks,
      defaultOpen:
        tasks.length > 0 && stage !== "launched" && stage !== "cancelled",
    };
  });
}
