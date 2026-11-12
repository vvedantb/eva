import { v, type Infer } from "convex/values";
import type { FilterBuilder, NamedTableInfo } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

/**
 * Who a session belongs to. One field, `sessions.owner`, holds it:
 *
 *   standalone   a session the user opened; listed in the sessions sidebar
 *   task         the hidden session behind one quick task (`agentTasks`)
 *   project      the hidden session a project and its tasks share
 *
 * The id lives inside its kind, so "task session without a task" cannot be
 * written. The owner is set at insert and never changes: there is no
 * transition to guard. The field is optional only until `dataMigrations:backfillSessionOwner`
 * has run; read it through `sessionOwner`, which treats absent as standalone.
 */
export const sessionOwnerValidator = v.union(
  v.object({ kind: v.literal("standalone") }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);

export type SessionOwner = Infer<typeof sessionOwnerValidator>;

/** A task or project owner, as an argument (`sessions.getOwned` / `ensureOwned`). */
export const ownedSessionOwnerValidator = v.union(
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);
/** A task or project owner: the kinds that own at most one session each. */
export type OwnedSessionOwner = Exclude<SessionOwner, { kind: "standalone" }>;

type OwnerFields = Pick<Doc<"sessions">, "owner">;

/** The owner every new user-opened session is inserted with. */
export const STANDALONE_SESSION_OWNER: SessionOwner = { kind: "standalone" };

export function sessionOwner(session: OwnerFields): SessionOwner {
  return session.owner ?? STANDALONE_SESSION_OWNER;
}

export function isStandaloneSession(session: OwnerFields): boolean {
  return sessionOwner(session).kind === "standalone";
}

/**
 * Query filter for the user-facing session surfaces (mentions, search,
 * analytics): a task's or project's session is reached through its owner.
 * The Sessions list itself reads `by_repo_owner_deleted_and_archived_at`.
 */
export function standaloneOnly(
  q: FilterBuilder<NamedTableInfo<DataModel, "sessions">>,
) {
  return q.eq(q.field("owner.kind"), "standalone");
}

/** The owner value for a quick task's session. */
export function taskSessionOwner(taskId: Id<"agentTasks">): OwnedSessionOwner {
  return { kind: "task", taskId };
}

/** The owner value for a project's session. */
export function projectSessionOwner(
  projectId: Id<"projects">,
): OwnedSessionOwner {
  return { kind: "project", projectId };
}

/**
 * Whether a task owns a session of its own: quick tasks only. A project task
 * works on its project's session (`taskWorkSessionOwner`).
 */
export function taskUsesOwnedSession(
  task: Pick<Doc<"agentTasks">, "projectId">,
): boolean {
  return task.projectId === undefined;
}

/**
 * The session a task works on (runs, chat, sandbox): its own for a quick
 * task, its project's for a project task.
 */
export function taskWorkSessionOwner(
  task: Pick<Doc<"agentTasks">, "_id" | "projectId">,
): OwnedSessionOwner {
  return task.projectId !== undefined
    ? projectSessionOwner(task.projectId)
    : taskSessionOwner(task._id);
}

/** The task's own session, or null before anything needed one. */
export async function findTaskSession(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, taskSessionOwner(taskId));
}

/** The project's session, or null before anything needed one. */
export async function findProjectSession(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, projectSessionOwner(projectId));
}

/**
 * A project task's own chat in its project's session (`sessionChats.taskId`),
 * if it has one.
 */
export async function findProjectTaskChat(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<Doc<"sessionChats"> | null> {
  return await db
    .query("sessionChats")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .first();
}

/**
 * A quick task's own session, or null (a project task, or a quick task not
 * yet on a session). For what only a task's own session holds; a task's
 * sandbox is read through `findTaskWorkSession`.
 */
export async function findQuickTaskSession(
  db: DatabaseReader,
  task: Pick<Doc<"agentTasks">, "_id" | "projectId">,
): Promise<Doc<"sessions"> | null> {
  return taskUsesOwnedSession(task) ? await findTaskSession(db, task._id) : null;
}

/**
 * Where a task's sandbox and chat live: its own session (a quick task) or its
 * project's (a project task), or null before that session exists (the task
 * or project then still keeps them on its own row). Every reader of a task's
 * sandbox asks here first.
 */
export async function findTaskWorkSession(
  db: DatabaseReader,
  task: Pick<Doc<"agentTasks">, "_id" | "projectId">,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, taskWorkSessionOwner(task));
}

/**
 * The session that holds the sandbox of a session, task or project named by
 * a bare id (an MCP token's entity): the session itself, the one a task works
 * on, or a project's. Null for a malformed id or before the session exists.
 */
export async function findEntitySession(
  db: DatabaseReader,
  kind: "session" | "task" | "project",
  id: string,
): Promise<Doc<"sessions"> | null> {
  if (kind === "session") {
    const sessionId = db.normalizeId("sessions", id);
    return sessionId ? await db.get(sessionId) : null;
  }
  if (kind === "task") {
    const taskId = db.normalizeId("agentTasks", id);
    const task = taskId ? await db.get(taskId) : null;
    return task ? await findTaskWorkSession(db, task) : null;
  }
  const projectId = db.normalizeId("projects", id);
  return projectId ? await findProjectSession(db, projectId) : null;
}

/** The task a session belongs to, or undefined for any other owner. */
export function sessionOwnerTaskId(
  session: OwnerFields,
): Id<"agentTasks"> | undefined {
  const owner = sessionOwner(session);
  return owner.kind === "task" ? owner.taskId : undefined;
}

/** The project a session belongs to, or undefined for any other owner. */
export function sessionOwnerProjectId(
  session: OwnerFields,
): Id<"projects"> | undefined {
  const owner = sessionOwner(session);
  return owner.kind === "project" ? owner.projectId : undefined;
}

/**
 * The task or project that owns the session, or undefined for a standalone
 * one. Attribution (docs, unread, mentions, watches) routes through it.
 */
export function sessionOwnerEntityId(
  session: OwnerFields,
): Id<"agentTasks"> | Id<"projects"> | undefined {
  return sessionOwnerTaskId(session) ?? sessionOwnerProjectId(session);
}

/**
 * Guard for the session-only actions an owned session refuses: fork, add to a
 * group, open another chat, rename. A task's or project's session mirrors its
 * owner; those actions belong to the owner, or to standalone sessions.
 */
export function assertStandaloneSession(
  session: OwnerFields,
  action: string,
): void {
  const owner = sessionOwner(session);
  if (owner.kind !== "standalone") {
    throw new Error(`A ${owner.kind}'s session cannot ${action}.`);
  }
}

/**
 * The one session a task or project owns, or null when it has none yet.
 * Throws when two sessions claim the same owner: that is a bug upstream.
 */
export async function findOwnedSession(
  db: DatabaseReader,
  owner: OwnedSessionOwner,
): Promise<Doc<"sessions"> | null> {
  switch (owner.kind) {
    case "task":
      return await db
        .query("sessions")
        // A detached (soft-deleted) session no longer belongs to the task.
        .withIndex("by_owner_task", (q) =>
          q.eq("owner.taskId", owner.taskId).eq("deletedAt", undefined),
        )
        .unique();
    case "project":
      return await db
        .query("sessions")
        .withIndex("by_owner_project", (q) =>
          q.eq("owner.projectId", owner.projectId),
        )
        .unique();
  }
}

/** The loaded task or project an owned session belongs to. */
export type OwnerEntity =
  | { kind: "task"; task: Doc<"agentTasks"> }
  | { kind: "project"; project: Doc<"projects"> };

/** A session and one of its chats. */
export type OwnerChat = {
  session: Doc<"sessions">;
  chat: Doc<"sessionChats">;
};

/**
 * Who one chat speaks for: a project task's own chat (`sessionChats.taskId`)
 * for that task, any other chat for its session's owner. Attribution, unread,
 * mentions, watches and the busy light all resolve through here.
 */
export function chatOwner(
  chat: Pick<Doc<"sessionChats">, "taskId">,
  session: OwnerFields,
): SessionOwner {
  return chat.taskId !== undefined
    ? { kind: "task", taskId: chat.taskId }
    : sessionOwner(session);
}

/** `chatOwner`'s task or project id; undefined for a standalone session. */
export function chatOwnerEntityId(
  chat: Pick<Doc<"sessionChats">, "taskId">,
  session: OwnerFields,
): Id<"agentTasks"> | Id<"projects"> | undefined {
  const owner = chatOwner(chat, session);
  if (owner.kind === "task") return owner.taskId;
  if (owner.kind === "project") return owner.projectId;
  return undefined;
}

/** Project phases that retire the project's session. */
export function isTerminalProjectPhase(phase: Doc<"projects">["phase"]) {
  return phase === "completed" || phase === "cancelled";
}

