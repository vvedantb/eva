import type { Doc } from "@eva/backend";
import { prStateLabel } from "./prState";
import { prNumberFromGithubUrl } from "./prReview";
import {
  projectStatus,
  projectTaskDisplayStatus,
  projectTaskNeedsYou,
  projectTaskStage,
  projectTaskWaitsForCoordinator,
  type NeedsYouReason,
  type ProjectStage,
  type ProjectStatus,
  type ProjectTaskDisplayStatus,
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
  "done",
] as const satisfies readonly ProjectStage[];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

/**
 * A project's task list groups, in order (`projectTaskStatusSections`), and
 * the order of the task counts and progress bar parts a project shows.
 */
export const PROJECT_TASK_DISPLAY_STATUSES = [
  "triage",
  "working",
  "blocked",
  "idle",
  "archived",
] as const satisfies readonly ProjectTaskDisplayStatus[];

export const PROJECT_TASK_DISPLAY_STATUS_LABELS: Record<
  ProjectTaskDisplayStatus,
  string
> = {
  triage: "Triage",
  working: "Working",
  blocked: "Blocked",
  idle: "Idle",
  archived: "Archived",
};

/**
 * Why a task waits for a person, in plain words: a Blocked row's second line
 * (`projectTaskSummaryLine`). Review and question rows add the PR or the
 * question when they know it.
 */
export const NEEDS_YOU_LABELS: Record<NeedsYouReason, string> = {
  usage_limit: "Usage limit",
  failed: "Failed twice",
  stopped: "Run stopped",
  pr_closed: "PR closed",
  approve: "Needs approval",
  review: "Needs you: review",
  question: "Asks you a question",
};

/** A task that asked its coordinator a question and waits for the answer. */
export const WAITING_FOR_COORDINATOR_LABEL = "Waiting for coordinator";

/**
 * The delete confirm's note: `projects.remove` keeps a project's child tasks
 * as quick tasks (it refuses while one runs, and says so).
 */
export function projectDeleteNote(count: number): string {
  return `${count === 1 ? "Its" : "Their"} tasks stay as quick tasks.`;
}

/** The project's coordinator hit its hourly cap of automatic turns. */
export const COORDINATOR_PAUSED_LABEL = "Coordinator paused";

/**
 * The coordinator chat's one-line notice while the hourly cap holds its
 * wake-ups back. A person's message releases them, so the line asks for one.
 */
export function coordinatorPausedTitle(maxAutoTurnsPerHour: number): string {
  return `${COORDINATOR_PAUSED_LABEL} after ${maxAutoTurnsPerHour} automatic turns this hour. Send a message to continue.`;
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
   * The server's facts for the task (`listByProject`): the usage limit and
   * open ask the row alone does not carry.
   */
  facts?: ProjectTaskFacts;
}

/**
 * One row as the shared rules read it. A row with the server's `facts` uses
 * them as they are. Without them the usage limit and open asks never show
 * here. A locked row counts as approved: its approval is not
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
 * One task's stage, its display status, the reason it waits for a person, if
 * any, and whether it waits for its coordinator to answer a question.
 */
export function projectTaskView(
  row: ProjectTaskRow,
  failed: boolean,
): ProjectTaskView {
  const facts = projectTaskFactsFromRow(row, failed);
  return {
    stage: projectTaskStage(facts),
    displayStatus: projectTaskDisplayStatus(facts),
    needsYou: projectTaskNeedsYou(facts),
    waitingForCoordinator: projectTaskWaitsForCoordinator(facts),
  };
}

export interface ProjectTaskView {
  stage: ProjectTaskStage;
  displayStatus: ProjectTaskDisplayStatus;
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
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
 * the derived stage and task counts by display status, how many tasks need a
 * person, and whether the coordinator is paused at its hourly cap.
 */
export interface ProjectListStatus {
  stage: ProjectStage;
  counts: ProjectStatus["counts"];
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
 * Archived tasks (launched or cancelled) out of all tasks, and the share as
 * a whole percent: the timeline's progress.
 */
export function projectArchivedShare(counts: ProjectStatus["counts"]): {
  archived: number;
  total: number;
  percent: number;
} {
  const total = PROJECT_TASK_DISPLAY_STATUSES.reduce(
    (sum, status) => sum + counts[status],
    0,
  );
  return {
    archived: counts.archived,
    total,
    percent: total > 0 ? Math.round((counts.archived / total) * 100) : 0,
  };
}

/**
 * True for a todo task nobody approved yet that the caller can see: what
 * Approve (`approveProjectTasks`) and Reject act on in Triage.
 */
export function isUnapprovedTodoTask(row: ProjectTaskRow): boolean {
  return (
    row.locked !== true &&
    row.status === "todo" &&
    row.approvedAt === undefined
  );
}

/** The todo tasks a person approves with one "Approve all". */
export function unapprovedTodoTaskIds<Row extends ProjectTaskRow>(
  rows: readonly Row[],
): Row["_id"][] {
  return rows.filter(isUnapprovedTodoTask).map((row) => row._id);
}

/** A Triage row's origin when it is not feedback: added without approval. */
export const ADDED_WITHOUT_APPROVAL_LABEL = "Added without approval";

/** What `projectTaskSummaryLine` reads of an `agentTasks.listByProject` row. */
export interface SummarizableProjectTaskRow {
  numId?: number;
  status: Doc<"agentTasks">["status"];
  origin?: Doc<"agentTasks">["origin"];
  phaseLabel?: string;
  prUrl?: string;
  prState?: Doc<"agentTasks">["prState"];
}

/** "#9003" from a GitHub PR URL, else the URL's last path part. */
export function prShortLabel(prUrl: string): string {
  const prNumber = prNumberFromGithubUrl(prUrl);
  if (prNumber !== undefined) return `#${prNumber}`;
  return prUrl.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? prUrl;
}

/** The one reason a row shows, by its display status. */
function projectTaskReason(
  row: SummarizableProjectTaskRow,
  view: ProjectTaskView,
  facts: { ask: string | undefined; failed: boolean; authorName: string | undefined },
): string {
  switch (view.displayStatus) {
    case "triage":
      if (row.origin !== "feedback") return ADDED_WITHOUT_APPROVAL_LABEL;
      return facts.authorName ? `Feedback from ${facts.authorName}` : "Feedback";
    case "working":
      return view.waitingForCoordinator
        ? WAITING_FOR_COORDINATOR_LABEL
        : PROJECT_TASK_DISPLAY_STATUS_LABELS.working;
    case "idle":
      return "Waiting for a free slot";
    case "archived":
      if (row.status === "cancelled") return "Cancelled";
      return row.prState === "merged" ? "Merged" : "Done";
    case "blocked":
      break;
  }
  if (facts.ask !== undefined) return `Asks: ${facts.ask}`;
  if (view.needsYou === "review" && row.prUrl !== undefined) {
    return `${NEEDS_YOU_LABELS.review} PR ${prShortLabel(row.prUrl)}`;
  }
  if (view.needsYou !== undefined) return NEEDS_YOU_LABELS[view.needsYou];
  return facts.failed ? "Run failed" : WAITING_FOR_COORDINATOR_LABEL;
}

/**
 * A project task row's second line, one plain sentence for web and phone:
 * "#904 · Needs you: review PR #9003 · api · Phase 2 · 1 report". The task
 * number, the one reason for its display status (a Triage task's origin, a
 * Blocked task's needs-you reason or open question, Idle's wait, Archived's
 * end), the repo when it is not the project's (`otherRepoLabel`), the phase,
 * and the open report count.
 */
export function projectTaskSummaryLine(
  row: SummarizableProjectTaskRow,
  view: ProjectTaskView,
  extra: {
    notes: ProjectTaskNotes | undefined;
    failed: boolean;
    /** A feedback task's author, by first name, once known. */
    authorName: string | undefined;
    /** Set only when the task's repo differs from the project's home repo. */
    otherRepoLabel: string | undefined;
  },
): string {
  const reports = extra.notes?.reports.length ?? 0;
  return [
    row.numId !== undefined ? `#${row.numId}` : undefined,
    projectTaskReason(row, view, {
      ask: extra.notes?.ask,
      failed: extra.failed,
      authorName: extra.authorName,
    }),
    extra.otherRepoLabel,
    row.phaseLabel,
    reports === 0 ? undefined : reports === 1 ? "1 report" : `${reports} reports`,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");
}

/** The tasks that have a PR: the task list's Pull requests group, in list order. */
export function projectTaskPullRequests<
  Row extends SummarizableProjectTaskRow & { locked?: boolean },
>(rows: readonly Row[]): Array<Row & { prUrl: string }> {
  return rows.flatMap((row) =>
    row.locked !== true && row.prUrl !== undefined
      ? [{ ...row, prUrl: row.prUrl }]
      : [],
  );
}

/** A Pull requests row's second line: "#9003 · Open · via #904". */
export function projectTaskPrLine(
  row: SummarizableProjectTaskRow & { prUrl: string },
): string {
  return [
    prShortLabel(row.prUrl),
    prStateLabel(row.prState),
    row.numId !== undefined ? `via #${row.numId}` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

/** The task counts as one muted line: "3 triage · 2 blocked · 1 archived". */
export function projectStatusCountsLine(
  counts: ProjectStatus["counts"],
): string {
  return PROJECT_TASK_DISPLAY_STATUSES.filter((status) => counts[status] > 0)
    .map(
      (status) =>
        `${counts[status]} ${PROJECT_TASK_DISPLAY_STATUS_LABELS[status].toLowerCase()}`,
    )
    .join(" · ");
}

/**
 * The progress bar's coloured parts, in `PROJECT_TASK_DISPLAY_STATUSES`
 * order: each non-empty display status's share of the tasks and where it
 * starts, both from 0 to 1.
 */
export function projectStatusSegments(
  status: Pick<ProjectStatus, "counts">,
): Array<{ status: ProjectTaskDisplayStatus; ratio: number; offset: number }> {
  const { total } = projectArchivedShare(status.counts);
  const segments: Array<{
    status: ProjectTaskDisplayStatus;
    ratio: number;
    offset: number;
  }> = [];
  let offset = 0;
  for (const displayStatus of PROJECT_TASK_DISPLAY_STATUSES) {
    const count = status.counts[displayStatus];
    if (count === 0) continue;
    const ratio = count / total;
    segments.push({ status: displayStatus, ratio, offset });
    offset += ratio;
  }
  return segments;
}

/** The fields `projectTaskStatusSections` reads from an `agentTasks.listByProject` row. */
export interface SectionableProjectTaskRow extends ProjectTaskRow {
  createdAt: number;
  lastRunStartedAt?: number;
}

/**
 * A project's task list: one section per display status that has tasks
 * (Triage, Working, Blocked, Idle, Archived), each row with its view. Idle
 * keeps the project's order (`taskNumber`); every other section puts the
 * latest run first, else the newest task. Every section but Archived starts
 * open.
 */
export function projectTaskStatusSections<
  Row extends SectionableProjectTaskRow,
>(
  rows: readonly Row[],
  failedTaskIds: ReadonlySet<string>,
): Array<{
  status: ProjectTaskDisplayStatus;
  tasks: Array<{ row: Row; view: ProjectTaskView }>;
  defaultOpen: boolean;
}> {
  const viewed = rows.map((row) => ({
    row,
    view: projectTaskView(row, failedTaskIds.has(row._id)),
  }));
  const lastRun = (row: Row) => row.lastRunStartedAt ?? row.createdAt;
  return PROJECT_TASK_DISPLAY_STATUSES.flatMap((status) => {
    const matching = viewed.filter(
      (task) => task.view.displayStatus === status,
    );
    if (matching.length === 0) return [];
    const tasks =
      status === "idle"
        ? matching
        : matching.sort((a, b) => lastRun(b.row) - lastRun(a.row));
    return [{ status, tasks, defaultOpen: status !== "archived" }];
  });
}
