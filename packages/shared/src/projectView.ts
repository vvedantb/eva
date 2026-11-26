import type { Doc } from "@eva/backend";
import { prStateLabel, type PrState } from "./prState";
import { repoDisplayLabel } from "./repoTile";
import { prNumberFromGithubUrl } from "./prReview";
import { ARCHIVE_LIST_MODE_LABELS } from "./archive";
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
// latest run failed (`agentTasks.getTaskIdsWithFailedRun`).

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
  "blocked",
  "working",
  "idle",
  "archived",
] as const satisfies readonly ProjectTaskDisplayStatus[];

export const PROJECT_TASK_DISPLAY_STATUS_LABELS: Record<
  ProjectTaskDisplayStatus,
  string
> = {
  working: "Working",
  blocked: "Needs you",
  idle: "Idle",
  archived: "Archived",
};

/**
 * Why a task waits for a person, in plain words: a Needs you row's second line
 * (`projectTaskSummaryLine`). Review and question rows add the PR or the
 * question when they know it.
 */
export const NEEDS_YOU_LABELS: Record<NeedsYouReason, string> = {
  usage_limit: "Usage limit",
  failed: "Failed twice",
  stopped: "Run stopped",
  pr_closed: "PR closed",
  review: "Needs you: review",
  question: "Asks you a question",
};

/** A task that asked its coordinator a question and waits for the answer. */
export const WAITING_FOR_COORDINATOR_LABEL = "Waiting for coordinator";

/** A task handed to the coordinator that it has not started or merged yet. */
export const WITH_COORDINATOR_LABEL = "With Eva";

/** The fields of an `agentTasks.listByProject` row the status rules read. */
export interface ProjectTaskRow {
  _id: string;
  taskNumber?: number;
  status: Doc<"agentTasks">["status"];
  prState?: Doc<"agentTasks">["prState"];
  approvedAt?: number;
  /** Handed to the coordinator (`withCoordinator`). */
  handedToCoordinatorAt?: number;
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
 * here. A locked row counts as approved.
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
    withCoordinator:
      row.status === "todo" && row.handedToCoordinatorAt !== undefined,
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
    withCoordinator: facts.withCoordinator === true,
  };
}

export interface ProjectTaskView {
  stage: ProjectTaskStage;
  displayStatus: ProjectTaskDisplayStatus;
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
  /** Handed to the coordinator; not started yet. */
  withCoordinator?: boolean;
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
 * the derived stage and task counts by display status, and how many tasks
 * need a person.
 */
export interface ProjectListStatus {
  stage: ProjectStage;
  counts: ProjectStatus["counts"];
  needsYouCount: number;
}

/**
 * Why a project on the list needs a person, in a few words, or undefined
 * when it does not.
 */
export function projectListNeedsYouLabel(
  status: ProjectListStatus,
): string | undefined {
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
 * A project task in To Do: until its chat has a message, the chat opens on
 * its prompt (title, prompt and an action) in place of an empty chat.
 */
export function showsProjectTaskPrompt(task: {
  projectId?: string;
  status: Doc<"agentTasks">["status"];
}): boolean {
  return task.projectId !== undefined && task.status === "todo";
}

/**
 * The prompt card's action: "with_eva" while the task is handed to the
 * coordinator (a quiet `WITH_COORDINATOR_LABEL` line, no button), else Start
 * (`agentTasks.startExecution`) on an approved todo task. None while a run
 * starts, or on a read-only (archived) task.
 */
export function projectTaskPromptAction(
  row: ProjectTaskRow,
  state: { hasActiveRun: boolean; readOnly: boolean },
): "start" | "with_eva" | undefined {
  if (state.readOnly || state.hasActiveRun || row.status !== "todo") {
    return undefined;
  }
  if (row.handedToCoordinatorAt !== undefined) return "with_eva";
  return row.approvedAt !== undefined ? "start" : undefined;
}

/** What `projectTaskSummaryLine` reads of an `agentTasks.listByProject` row. */
export interface SummarizableProjectTaskRow {
  numId?: number;
  status: Doc<"agentTasks">["status"];
  phaseLabel?: string;
  prUrl?: string;
  prState?: Doc<"agentTasks">["prState"];
  /** The open task the coordinator added this handed task to. */
  mergedIntoTaskId?: string;
  /** Archived on its own: listed under Archived (`projectTaskStatusSections`). */
  archivedAt?: number;
  /** A multi-repo task's PRs, one per repo (`listByProject`). */
  repoPrs?: ReadonlyArray<{
    prUrl: string;
    prState: NonNullable<Doc<"agentTasks">["prState"]>;
    repoName: string;
  }>;
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
  facts: {
    ask: string | undefined;
    failed: boolean;
    mergedIntoNumId: number | undefined;
  },
): string {
  switch (view.displayStatus) {
    case "working":
      return view.waitingForCoordinator
        ? WAITING_FOR_COORDINATOR_LABEL
        : PROJECT_TASK_DISPLAY_STATUS_LABELS.working;
    case "idle":
      return view.withCoordinator === true
        ? WITH_COORDINATOR_LABEL
        : "Waiting for a free slot";
    case "archived":
      if (row.archivedAt !== undefined) return ARCHIVE_LIST_MODE_LABELS.archived;
      if (row.status === "cancelled") {
        return facts.mergedIntoNumId !== undefined
          ? `Added to #${facts.mergedIntoNumId}`
          : "Cancelled";
      }
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
 * number, the one reason for its display status (a Needs you task's reason
 * or open question, Idle's wait or "With Eva", Archived's end), the repo when it is not the project's (`otherRepoLabel`), the phase,
 * and the open report count.
 */
export function projectTaskSummaryLine(
  row: SummarizableProjectTaskRow,
  view: ProjectTaskView,
  extra: {
    notes: ProjectTaskNotes | undefined;
    failed: boolean;
    /** Set only when the task's repo differs from the project's home repo. */
    otherRepoLabel: string | undefined;
    /** The task number of a task, by id: names a merged item's target. */
    numIdOf?: (taskId: string) => number | undefined;
    /** The task is open as a chat tab beside Eva (web). */
    open?: boolean;
  },
): string {
  const reports = extra.notes?.reports.length ?? 0;
  return [
    row.numId !== undefined ? `#${row.numId}` : undefined,
    extra.open === true ? "Open" : undefined,
    projectTaskReason(row, view, {
      ask: extra.notes?.ask,
      failed: extra.failed,
      mergedIntoNumId:
        row.mergedIntoTaskId !== undefined
          ? extra.numIdOf?.(row.mergedIntoTaskId)
          : undefined,
    }),
    extra.otherRepoLabel,
    row.phaseLabel,
    reports === 0 ? undefined : reports === 1 ? "1 report" : `${reports} reports`,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");
}

/**
 * The tasks that have a PR: the task list's Pull requests group, in list
 * order. A multi-repo task is one entry per repo's PR, labelled with its
 * repo (`repoName`); a single-repo task is one entry, as before.
 */
export function projectTaskPullRequests<
  Row extends SummarizableProjectTaskRow & { locked?: boolean },
>(rows: readonly Row[]): Array<Row & { prUrl: string; repoName?: string }> {
  return rows.flatMap((row) => {
    if (row.locked === true) return [];
    if (row.repoPrs !== undefined && row.repoPrs.length > 0) {
      return row.repoPrs.map((pr) => ({
        ...row,
        prUrl: pr.prUrl,
        prState: pr.prState,
        repoName: pr.repoName,
      }));
    }
    return row.prUrl !== undefined ? [{ ...row, prUrl: row.prUrl }] : [];
  });
}

/**
 * A task's own stage in words, for its header: To do, Working, In review,
 * Done or Cancelled. The Tasks list groups by display status instead (a task
 * in review sits under "Needs you" there).
 */
export function projectTaskStageLabel(stage: ProjectTaskStage): string {
  switch (stage) {
    case "todo":
      return "To do";
    case "in_progress":
      return "Working";
    case "in_review":
      return "In review";
    case "launched":
      return "Done";
    case "cancelled":
      return "Cancelled";
  }
}

/**
 * One task card under Eva's reply (`projects.listChatTaskCards`), for web and
 * phone: the task's number, title, view and its own stage in words, from the
 * project's task list (`agentTasks.listByProject`) so it stays live. Null for
 * a task not in the list (archived), locked to the reader, or with no number
 * to open it by.
 */
export function projectChatTaskCard<
  Row extends ProjectTaskRow & { numId?: number; title: string },
>(
  rows: readonly Row[],
  taskId: string,
  failedTaskIds: ReadonlySet<string>,
): { numId: number; title: string; view: ProjectTaskView; stageLabel: string } | null {
  const row = rows.find((entry) => entry._id === taskId);
  if (!row || row.locked === true || row.numId === undefined) return null;
  const view = projectTaskView(row, failedTaskIds.has(row._id));
  return {
    numId: row.numId,
    title: row.title,
    view,
    stageLabel: projectTaskStageLabel(view.stage),
  };
}

/** What `projectTaskFacts` reads of a project task (its `agentTasks` row). */
export interface FactsProjectTaskRow extends ProjectTaskRow {
  repoId?: string;
  linkedRepoIds?: readonly string[];
  phaseLabel?: string;
  archivedAt?: number;
}

/**
 * A project task's status and PR line under its title in its header, for
 * web and phone: the plain text
 * "Working · Phase 2 · docs", then its PR links. The text is the task's own
 * stage (`projectTaskStageLabel`: "In review", not the list's "Needs you"
 * group), the phase, and on a multi-repo task
 * each repo without a PR. A PR link names its repo on a multi-repo task, so
 * each repo shows once. A `listByProject` row carries the server's facts; a
 * bare task row reads as never failed.
 */
export function projectTaskFacts<
  Pr extends { prUrl: string; state: PrState; repoId: string; repoName: string },
>(
  row: FactsProjectTaskRow,
  repos: ReadonlyArray<{
    _id: string;
    name: string;
    label?: string;
    rootDirectory?: string;
  }>,
  prs: readonly Pr[],
): {
  text: string;
  /** Each PR with its link label: "#12", or "api #12" on a multi-repo task. */
  prs: Array<Pr & { label: string }>;
} {
  const view = projectTaskView(row, false);
  const status = row.archivedAt !== undefined ? "Archived" : projectTaskStageLabel(view.stage);
  const linked = row.linkedRepoIds ?? [];
  const multiRepo = linked.length > 0;
  const repoLabel = (repoId: string) => {
    const repo = repos.find((entry) => entry._id === repoId);
    return repo ? repoDisplayLabel(repo) : undefined;
  };
  const prRepoIds = new Set(prs.map((pr) => pr.repoId));
  const reposWithoutPr = multiRepo
    ? [row.repoId, ...linked].flatMap((repoId) =>
        repoId === undefined || prRepoIds.has(repoId) ? [] : [repoLabel(repoId)],
      )
    : [];
  return {
    text: [
      status,
      row.phaseLabel,
      ...reposWithoutPr,
    ]
      .filter((part) => part !== undefined && part !== "")
      .join(" · "),
    prs: prs.map((pr) => ({
      ...pr,
      label: [
        multiRepo ? (repoLabel(pr.repoId) ?? pr.repoName) : undefined,
        prShortLabel(pr.prUrl),
      ]
        .filter((part) => part !== undefined && part !== "")
        .join(" "),
    })),
  };
}

/**
 * A Pull requests row's second line: "#9003 · Open · via #904", with the
 * repo for a multi-repo task's PR ("#12 · Open · api · via #904").
 */
export function projectTaskPrLine(
  row: SummarizableProjectTaskRow & { prUrl: string; repoName?: string },
): string {
  return [
    prShortLabel(row.prUrl),
    prStateLabel(row.prState),
    row.repoName || undefined,
    row.numId !== undefined ? `via #${row.numId}` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

/** The task counts as one muted line: "2 needs you · 3 working · 1 archived". */
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

/** A task archived on its own: Archived, waiting for no one. */
function archivedTaskView(row: ProjectTaskRow): ProjectTaskView {
  return {
    ...projectTaskView(row, false),
    displayStatus: "archived",
    needsYou: undefined,
    waitingForCoordinator: false,
  };
}

/**
 * A project's task list: one section per display status that has tasks
 * (Needs you, Working, Idle, Archived), each row with its view. Tasks
 * archived on their own (`archivedRows`, `listByProject` with `archived`)
 * join Archived beside the done and cancelled tasks. Idle keeps the
 * project's order (`taskNumber`); every other section puts the latest run
 * first, else the newest task. Every section but Archived starts open.
 */
export function projectTaskStatusSections<
  Row extends SectionableProjectTaskRow,
>(
  rows: readonly Row[],
  failedTaskIds: ReadonlySet<string>,
  archivedRows: readonly Row[] = [],
): Array<{
  status: ProjectTaskDisplayStatus;
  tasks: Array<{ row: Row; view: ProjectTaskView }>;
  defaultOpen: boolean;
}> {
  const viewed = [
    ...rows.map((row) => ({
      row,
      view: projectTaskView(row, failedTaskIds.has(row._id)),
    })),
    ...archivedRows.map((row) => ({ row, view: archivedTaskView(row) })),
  ];
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
