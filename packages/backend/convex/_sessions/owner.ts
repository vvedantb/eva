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
        .withIndex("by_owner_task", (q) => q.eq("owner.taskId", owner.taskId))
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
