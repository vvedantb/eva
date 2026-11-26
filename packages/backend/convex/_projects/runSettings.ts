import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { lastTaskRunOutcome } from "../_agentTasks/taskRunStatus";
import {
  sessionOwnerProjectId,
  sessionOwnerTaskId,
} from "../_sessions/owner";

/**
 * Decision 20: a project's coordinator and every child task run on the
 * project's one model and account (`projects.model`,
 * `projects.providerAccountId`; none is the team credential). The rules here
 * are shared by a child task's runs (`startTaskRun`) and by every chat turn a
 * person starts in the child task's own session, so both paths pick and
 * unlock the same account.
 */

type ProjectAccount = Pick<Doc<"projects">, "userId" | "providerAccountId">;
type ProjectRunSource = ProjectAccount & Pick<Doc<"projects">, "model">;
type RunSettings = Pick<Doc<"agentTasks">, "model" | "providerAccountId">;

/**
 * Whether a project task takes its project's model and account at its next
 * start: before its first run, and after a usage limit stopped it, so a
 * changed project account takes over. A running task keeps its copy, and a
 * later pick in the task's own selector stays the task's.
 */
export async function takesProjectSettings(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  const last = await lastTaskRunOutcome(db, task);
  return last === null || last.usageLimited;
}

/** The model and account a project task copies from its project. */
export function projectRunSettings(
  project: ProjectRunSource,
  task: RunSettings,
): RunSettings {
  return {
    model: project.model ?? task.model,
    providerAccountId: project.providerAccountId,
  };
}

/**
 * The model and account a task runs (and its chat starts) on now: its
 * project's while it takes them (`takesProjectSettings`), else its own.
 */
export async function taskRunSettings(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<RunSettings> {
  const project =
    task.projectId !== undefined ? await db.get(task.projectId) : null;
  if (project && (await takesProjectSettings(db, task))) {
    return projectRunSettings(project, task);
  }
  return { model: task.model, providerAccountId: task.providerAccountId };
}

/**
 * Whose personal account a run or chat turn on `providerAccountId` uses and
 * unlocks: the project owner's for the project's own account (it was checked
 * against them in `projects.update`), else `fallback` (the task's or the
 * session's creator). Team (undefined) belongs to nobody, so it stays with
 * `fallback`.
 */
export function accountHolder(
  project: ProjectAccount | null,
  providerAccountId: Id<"userProviderAccounts"> | undefined,
  fallback: Id<"users">,
): Id<"users"> {
  return project !== null &&
    providerAccountId !== undefined &&
    providerAccountId === project.providerAccountId
    ? project.userId
    : fallback;
}

/**
 * `accountHolder` for a chat turn in `session`: in a project child task's own
 * session, the project's account is the project owner's, as for the task's
 * runs; any other account, and any other session, is the session creator's.
 * Every chat path that validates, unlocks or labels an account asks here, so
 * a warm daemon and the turn it serves agree.
 */
export async function sessionAccountHolder(
  db: DatabaseReader,
  session: Pick<Doc<"sessions">, "owner" | "createdBy" | "userId">,
  providerAccountId: Id<"userProviderAccounts"> | undefined,
): Promise<Id<"users">> {
  const fallback = session.createdBy ?? session.userId;
  if (providerAccountId === undefined) return fallback;
  const taskId = sessionOwnerTaskId(session);
  const task = taskId !== undefined ? await db.get(taskId) : null;
  const project =
    task?.projectId !== undefined ? await db.get(task.projectId) : null;
  return accountHolder(project, providerAccountId, fallback);
}

/**
 * The project a session works for: a coordinator's own project, or a child
 * task's project. Null for a quick task's or a standalone session.
 */
export async function sessionProject(
  db: DatabaseReader,
  session: Pick<Doc<"sessions">, "owner">,
): Promise<Doc<"projects"> | null> {
  const projectId = sessionOwnerProjectId(session);
  if (projectId !== undefined) return await db.get(projectId);
  const taskId = sessionOwnerTaskId(session);
  const task = taskId !== undefined ? await db.get(taskId) : null;
  return task?.projectId !== undefined ? await db.get(task.projectId) : null;
}
