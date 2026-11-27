import type { Infer } from "convex/values";
import {
  projectStatus,
  projectTaskNeedsYou,
  projectTaskStage,
  projectTaskWaitsForCoordinator,
  type ProjectStage,
  type ProjectTaskFacts,
} from "@eva/shared/projectStatus";
import type { DatabaseReader } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { hasTaskAccess } from "../functions";
import {
  projectTaskFactsValidator,
  projectTaskRowValidator,
} from "../_validators/projectTasks";
import {
  listProjectTasks,
  loadProjectFactsContext,
  projectTaskFacts,
  taskLabel,
} from "./scheduler";

/**
 * Every child task's facts for the project, in no set order. The one loader
 * the list queries share.
 */
export async function loadProjectTaskFacts(
  db: DatabaseReader,
  project: Doc<"projects">,
): Promise<Map<string, ProjectTaskFacts>> {
  const [tasks, context] = await Promise.all([
    listProjectTasks(db, project._id),
    loadProjectFactsContext(db, project, Date.now()),
  ]);
  const facts = await Promise.all(
    tasks.map((task) => projectTaskFacts(db, context, task)),
  );
  return new Map(facts.map((fact) => [fact.id, fact]));
}

/** The project's derived stage (`projectStatus`): what lists and MCP report as its status. */
export async function derivedProjectStage(
  db: DatabaseReader,
  project: Doc<"projects">,
): Promise<ProjectStage> {
  return projectStatus([...(await loadProjectTaskFacts(db, project)).values()])
    .stage;
}

/** At most this many tasks go into the coordinator's prompt table. */
export const PROJECT_TASK_TABLE_PROMPT_LIMIT = 60;

const ROW_TEXT_MAX = 300;

export { projectTaskFactsValidator, projectTaskRowValidator };

export type ProjectTaskRow = Infer<typeof projectTaskRowValidator>;

function clip(text: string): string {
  return text.length > ROW_TEXT_MAX ? `${text.slice(0, ROW_TEXT_MAX)}…` : text;
}

async function taskRow(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
  facts: ProjectTaskFacts,
  coordinatorLastTurnAt: number,
): Promise<ProjectTaskRow> {
  const [reports, repo] = await Promise.all([
    db
      .query("projectTaskReports")
      .withIndex("by_task_and_state", (q) =>
        q.eq("taskId", task._id).eq("state", "open"),
      )
      .collect(),
    task.repoId ? db.get(task.repoId) : null,
  ]);
  const ask = reports.find((row) => row.kind === "ask");
  return {
    locked: false,
    taskId: task._id,
    taskNumber: task.taskNumber,
    title: task.title,
    status: task.status,
    stage: projectTaskStage(facts),
    approved: facts.approved,
    phaseLabel: task.phaseLabel,
    repoId: task.repoId,
    repo: repo ? `${repo.owner}/${repo.name}` : undefined,
    prState: task.prState,
    prUrl: task.prUrl,
    needsYou: projectTaskNeedsYou(facts),
    waitingForCoordinator: projectTaskWaitsForCoordinator(facts),
    openAsk: ask ? clip(ask.text) : undefined,
    newReports: reports
      .filter(
        (row) => row.kind === "report" && row.createdAt > coordinatorLastTurnAt,
      )
      .map((row) => clip(row.text)),
    coordinatorRetries: task.coordinatorRetries ?? 0,
  };
}

/**
 * The project's task rows in `taskNumber` order. With `userId`, a task in a
 * repo that user cannot open is a locked row.
 */
export async function loadProjectTaskRows(
  db: DatabaseReader,
  project: Doc<"projects">,
  userId: Id<"users"> | undefined,
): Promise<ProjectTaskRow[]> {
  const [tasks, context, coordinator] = await Promise.all([
    listProjectTasks(db, project._id),
    loadProjectFactsContext(db, project, Date.now()),
    db
      .query("sessions")
      .withIndex("by_owner_project", (q) =>
        q.eq("owner.projectId", project._id),
      )
      .unique(),
  ]);
  const coordinatorLastTurnAt = coordinator?.lastTurnFinishedAt ?? 0;
  tasks.sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0));
  return await Promise.all(
    tasks.map(async (task): Promise<ProjectTaskRow> => {
      if (userId !== undefined && !(await hasTaskAccess(db, task, userId))) {
        return { locked: true, taskId: task._id };
      }
      const facts = await projectTaskFacts(db, context, task);
      return await taskRow(db, task, facts, coordinatorLastTurnAt);
    }),
  );
}

function formatRow(row: ProjectTaskRow): string {
  if (row.locked) return `| (a task in a repo you cannot open) | | | | | |`;
  const state = row.waitingForCoordinator
    ? "waiting for you (it asked)"
    : row.needsYou
      ? `${row.stage}, needs a person: ${row.needsYou}`
      : row.approved || row.stage !== "todo"
        ? row.stage
        : "todo, in Triage (a person approves it)";
  const notes = [
    row.openAsk ? `asks: ${row.openAsk}` : "",
    ...row.newReports.map((text) => `report: ${text}`),
  ]
    .filter((text) => text !== "")
    .join(" / ")
    .replaceAll("|", "/")
    .replaceAll("\n", " ");
  return `| ${taskLabel(row).replaceAll("|", "/")} (${row.taskId}) | ${state} | ${row.phaseLabel ?? ""} | ${row.repo ?? ""} | ${row.prState ?? "no PR"} | ${notes} |`;
}

/**
 * The coordinator's task table: number, title and id, state, phase, repo, PR
 * state, and open asks or new reports. At most
 * `PROJECT_TASK_TABLE_PROMPT_LIMIT` rows; tasks still open come first when
 * the table is cut. Empty when the project has no tasks.
 */
export function formatProjectTaskTable(rows: readonly ProjectTaskRow[]): string {
  if (rows.length === 0) return "";
  const open = rows.filter(
    (row) => row.locked || (row.stage !== "launched" && row.stage !== "cancelled"),
  );
  const ended = rows.filter((row) => !open.includes(row));
  const shown = [...open, ...ended].slice(0, PROJECT_TASK_TABLE_PROMPT_LIMIT);
  const cut =
    rows.length > shown.length
      ? `\n[${rows.length - shown.length} more ended tasks not shown. Call list_agents with scope "project" for all.]`
      : "";
  return [
    `Project tasks (live when this turn started):`,
    `| Task | State | Phase | Repo | PR | Asks and reports |`,
    `|---|---|---|---|---|---|`,
    ...shown.map(formatRow),
  ].join("\n") + cut;
}
