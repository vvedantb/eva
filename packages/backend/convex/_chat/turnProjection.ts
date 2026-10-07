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
 * The same bridge for task and project chats, keyed on
 * `chatTurnLifecycleVersion`. A workflow turn sets `activeChatWorkflowId`; a
 * daemon-minted (synthetic) turn sets only `syntheticTurnMessageId`.
 */
export function isLegacyChatExecuting(
  entity: Pick<
    Doc<"agentTasks"> | Doc<"projects">,
    "activeChatWorkflowId" | "syntheticTurnMessageId" | "chatTurnLifecycleVersion"
  >,
): boolean {
  return (
    entity.chatTurnLifecycleVersion === undefined &&
    (entity.activeChatWorkflowId !== undefined ||
      entity.syntheticTurnMessageId !== undefined)
  );
}

/**
 * Every chat entity in one repo with a turn open. One indexed query per list
 * subscription, never one turn lookup per row. Ids are unique across tables,
 * so one set serves sessions, tasks and projects alike.
 */
export async function openChatEntityIdsForRepo(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
): Promise<ReadonlySet<string>> {
  const turns = await db
    .query("turns")
    .withIndex("by_repo_open", (q) => q.eq("repoId", repoId).eq("open", true))
    .collect();
  return new Set(turns.map((turn) => String(turn.entityId)));
}

/** True while one named chat entity has a turn open. */
export async function hasOpenChatTurn(
  db: DatabaseReader,
  entityId: Doc<"turns">["entityId"],
): Promise<boolean> {
  const turn = await db
    .query("turns")
    .withIndex("by_entity_open", (q) =>
      q.eq("entityId", entityId).eq("open", true),
    )
    .first();
  return turn !== null;
}

/** The open-turn set for one entity, in the shape the projections take. */
export async function openChatEntityIdsFor(
  db: DatabaseReader,
  entityId: Doc<"turns">["entityId"],
): Promise<ReadonlySet<string>> {
  return new Set(
    (await hasOpenChatTurn(db, entityId)) ? [String(entityId)] : [],
  );
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
  openChatEntityIds: ReadonlySet<string>,
): boolean {
  return (
    openChatEntityIds.has(String(session._id)) ||
    isLegacySessionExecuting(session)
  );
}

/** Whether a task or project chat has a turn open, synthetic turns included. */
export function chatTurnIsOpen(
  entity: Pick<
    Doc<"agentTasks"> | Doc<"projects">,
    | "_id"
    | "activeChatWorkflowId"
    | "syntheticTurnMessageId"
    | "chatTurnLifecycleVersion"
  >,
  openChatEntityIds: ReadonlySet<string>,
): boolean {
  return (
    openChatEntityIds.has(String(entity._id)) || isLegacyChatExecuting(entity)
  );
}

/**
 * One "sandbox busy" status for a quick task: its main run and its chat turn
 * share one sandbox, and the queue already treats them as exclusive.
 */
export function taskIsExecuting(
  task: Pick<
    Doc<"agentTasks">,
    | "_id"
    | "activeWorkflowId"
    | "activeChatWorkflowId"
    | "syntheticTurnMessageId"
    | "chatTurnLifecycleVersion"
  >,
  openChatEntityIds: ReadonlySet<string>,
): boolean {
  return (
    task.activeWorkflowId !== undefined ||
    chatTurnIsOpen(task, openChatEntityIds)
  );
}

/** A project adds a build workflow to the same pair of slots. */
export function projectIsExecuting(
  project: Pick<
    Doc<"projects">,
    | "_id"
    | "activeWorkflowId"
    | "activeBuildWorkflowId"
    | "activeChatWorkflowId"
    | "syntheticTurnMessageId"
    | "chatTurnLifecycleVersion"
  >,
  openChatEntityIds: ReadonlySet<string>,
): boolean {
  return (
    project.activeWorkflowId !== undefined ||
    project.activeBuildWorkflowId !== undefined ||
    chatTurnIsOpen(project, openChatEntityIds)
  );
}
