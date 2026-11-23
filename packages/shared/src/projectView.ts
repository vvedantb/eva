import type { Doc } from "@eva/backend";
import {
  projectStatus,
  projectTaskNeedsYou,
  projectTaskStage,
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
}

/**
 * One row as the shared rules read it. The list rows do not carry the usage
 * limit, the dependencies or open asks, so those never show here; the
 * scheduler reads them on the server. A locked row counts as approved: its
 * approval is not the caller's to give.
 */
export function projectTaskFactsFromRow(
  row: ProjectTaskRow,
  failed: boolean,
): ProjectTaskFacts {
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

/** One task's stage and the reason it waits for a person, if any. */
export function projectTaskView(
  row: ProjectTaskRow,
  failed: boolean,
): { stage: ProjectTaskStage; needsYou: NeedsYouReason | undefined } {
  const facts = projectTaskFactsFromRow(row, failed);
  return {
    stage: projectTaskStage(facts),
    needsYou: projectTaskNeedsYou(facts),
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
  status: ProjectStatus,
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
 * row with the reason it waits for a person. To Do keeps the project's order
 * (`taskNumber`); every other section puts the latest run first, else the
 * newest task. A section starts open when it has tasks and is not Launched
 * or Cancelled.
 */
export function projectTaskStageSections<Row extends SectionableProjectTaskRow>(
  rows: readonly Row[],
  failedTaskIds: ReadonlySet<string>,
): Array<{
  stage: ProjectTaskStage;
  tasks: Array<{ row: Row; needsYou: NeedsYouReason | undefined }>;
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
      .map(({ row, needsYou }) => ({ row, needsYou }));
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
