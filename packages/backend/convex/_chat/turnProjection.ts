import type { DatabaseReader } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Deployment bridge for workflows that started before durable Turns existed.
 * Once a session opens any durable Turn, the marker permanently removes these
 * fallbacks so stale legacy fields can never become authoritative again.
 */
export function isLegacySessionExecuting(
  session: Pick<
    Doc<"sessions">,
    "activeWorkflowId" | "syntheticTurnMessageId" | "turnLifecycleVersion"
  >,
): boolean {
  return (
    session.turnLifecycleVersion === undefined &&
    (session.activeWorkflowId !== undefined ||
      session.syntheticTurnMessageId !== undefined)
  );
}

/**
 * One indexed query per list subscription, never one turn lookup per row.
 * The repo index also holds task and project chat turns; keep sessions only.
 */
export async function openSessionIdsForRepo(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
): Promise<ReadonlySet<string>> {
  const turns = await db
    .query("turns")
    .withIndex("by_repo_open", (q) => q.eq("repoId", repoId).eq("open", true))
    .collect();
  return new Set(
    turns
      .map((turn) => db.normalizeId("sessions", turn.entityId))
      .filter((sessionId) => sessionId !== null)
      .map(String),
  );
}

/** True while one named session has a turn open. */
export async function sessionHasOpenTurn(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): Promise<boolean> {
  const turn = await db
    .query("turns")
    .withIndex("by_entity_open", (q) =>
      q.eq("entityId", sessionId).eq("open", true),
    )
    .first();
  return turn !== null;
}

/**
 * Whether a session is mid-turn. `activeWorkflowId` alone is NOT the answer: a
 * daemon-minted continuation (`/loop`) never gets one, so anything keying off
 * that field alone reports an actively running session as idle.
 */
export function sessionIsExecuting(
  session: Pick<
    Doc<"sessions">,
    | "_id"
    | "activeWorkflowId"
    | "syntheticTurnMessageId"
    | "turnLifecycleVersion"
  >,
  openSessionIds: ReadonlySet<string>,
): boolean {
  return (
    openSessionIds.has(String(session._id)) || isLegacySessionExecuting(session)
  );
}

/** A quick task runs its main workflow and its sandbox chat independently. */
export function taskIsExecuting(
  task: Pick<Doc<"agentTasks">, "activeWorkflowId" | "activeChatWorkflowId">,
): boolean {
  return (
    task.activeWorkflowId !== undefined ||
    task.activeChatWorkflowId !== undefined
  );
}

/** A project adds a build workflow to the same pair of slots. */
export function projectIsExecuting(
  project: Pick<
    Doc<"projects">,
    "activeWorkflowId" | "activeBuildWorkflowId" | "activeChatWorkflowId"
  >,
): boolean {
  return (
    project.activeWorkflowId !== undefined ||
    project.activeBuildWorkflowId !== undefined ||
    project.activeChatWorkflowId !== undefined
  );
}
