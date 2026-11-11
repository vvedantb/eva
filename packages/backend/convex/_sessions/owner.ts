import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
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
