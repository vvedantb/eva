import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { lastTaskRunOutcome } from "../_agentTasks/taskRunStatus";
import type { ChatSettingsSource } from "../_sessionChats/helpers";
import {
  sessionOwnerProjectId,
  sessionOwnerTaskId,
} from "../_sessions/owner";
import { findWorkChat } from "../_sessions/ownerState";

/** Eva's chat settings for a project, or null before her chat exists. */
export async function evaChatSettings(
  db: DatabaseReader,
  project: Doc<"projects">,
): Promise<ChatSettingsSource | null> {
  return (await findWorkChat(db, { kind: "project", project }))?.chat ?? null;
}

/** The project's account and its holder, as `accountHolder` compares them. */
export type ProjectAccount = {
  userId: Id<"users">;
  providerAccountId: Id<"userProviderAccounts"> | undefined;
};

export async function projectAccount(
  db: DatabaseReader,
  project: Doc<"projects">,
): Promise<ProjectAccount> {
  const settings = await evaChatSettings(db, project);
  return {
    userId: project.userId,
    providerAccountId: settings?.providerAccountId,
  };
}

/**
 * Whether a project task takes Eva's model and account at its next start:
 * after a usage limit stopped its last run, so a changed account takes over.
 * Otherwise the task's chat keeps its own picks.
 */
export async function takesEvaSettings(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  const last = await lastTaskRunOutcome(db, task);
  return last !== null && last.usageLimited;
}

/**
 * Whose personal account a chat turn on `providerAccountId` uses and
 * unlocks: the project owner's for the project's own account, else
 * `fallback` (the task's or the session's creator). Team (undefined) belongs
 * to nobody, so it stays with `fallback`.
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
 * session, the project's account is the project owner's; any other account,
 * and any other session, is the session creator's. Every chat path that
 * validates, unlocks or labels an account asks here, so a warm daemon and the
 * turn it serves agree.
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
  return accountHolder(
    project ? await projectAccount(db, project) : null,
    providerAccountId,
    fallback,
  );
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
