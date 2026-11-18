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
 * transition to guard.
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
  return session.owner;
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

/** A task: it works on a session it may not own (a project task). */
type WorkTask = Pick<Doc<"agentTasks">, "_id" | "projectId">;

/** Anything that works on an owned session: a task, or a loaded owner. */
export type WorkTarget = WorkTask | OwnerEntity;

/**
 * The one rule for which session something works on (runs, chat, sandbox):
 * a project and all its tasks share the project's session; a quick task
 * owns its own.
 */
export function workSessionOwner(target: WorkTarget): OwnedSessionOwner {
  if ("kind" in target) {
    return target.kind === "task"
      ? workSessionOwner(target.task)
      : { kind: "project", projectId: target.project._id };
  }
  return target.projectId !== undefined
    ? { kind: "project", projectId: target.projectId }
    : { kind: "task", taskId: target._id };
}

/**
 * The session a task or owner works on (`workSessionOwner`), or null before
 * anything needed it (the owner then still keeps its sandbox fields on its
 * own row). Every reader of a task's session asks here; a bare project id
 * reads `findOwnedSession` directly.
 */
export async function findWorkSession(
  db: DatabaseReader,
  target: WorkTarget,
): Promise<Doc<"sessions"> | null> {
  return await findOwnedSession(db, workSessionOwner(target));
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
    return task ? await findWorkSession(db, task) : null;
  }
  const projectId = db.normalizeId("projects", id);
  return projectId
    ? await findOwnedSession(db, { kind: "project", projectId })
    : null;
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
 * The one session a task or project owns, or null when it has none yet. A
 * raw lookup by owner: what a task or project works on is `findWorkSession`.
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

