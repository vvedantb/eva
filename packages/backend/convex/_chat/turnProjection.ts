import type { DatabaseReader, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isTaskRunning, type TaskRunSource } from "../_agentTasks/runState";
import {
  isProjectBuilding,
  type ProjectBuildSource,
} from "../_projects/buildState";
import {
  isProjectInterviewing,
  type ProjectInterviewSource,
} from "../_projects/interviewState";
import type { TurnLane } from "../validators";
import { findOpenTurn, type TurnEntityId } from "./turnStore";
import {
  chatOwnerEntityId,
  findProjectSession,
  findProjectTaskChat,
  findTaskSession,
  sessionOwnerEntityId,
} from "../_sessions/owner";

/**
 * Every chat entity in one repo with a turn open. One indexed query per list
 * subscription, never one turn lookup per row. Ids are unique across tables,
 * so one set serves sessions, tasks and projects alike. A session chat's turn
 * is filed under both the chat and its session, so a session row lights up
 * while any of its chats runs.
 */
export async function openChatEntityIdsForRepo(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
): Promise<ReadonlySet<string>> {
  return idsOfTurns(db, await openChatTurnsForRepo(db, repoId));
}

/**
 * Chat entities in one repo whose open turn waits on an unanswered blocking
 * question (`pendingQuestions`). Only an open turn can hold one, so this reads
 * one small range per open turn, never one per list row. Same id shape as
 * `openChatEntityIdsForRepo`: a session lights up while any of its chats asks.
 */
export async function awaitingAnswerEntityIdsForRepo(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
): Promise<ReadonlySet<string>> {
  return awaitingAnswerIdsOf(db, await openChatTurnsForRepo(db, repoId));
}

/**
 * Both list flags (open turn, awaiting an answer) across the given repos, from
 * one open-turn read per repo instead of one per flag.
 */
export async function chatTurnFlagsForRepos(
  db: DatabaseReader,
  repoIds: Iterable<Id<"githubRepos">>,
): Promise<{
  openIds: ReadonlySet<string>;
  awaitingAnswerIds: ReadonlySet<string>;
}> {
  const turns = (
    await Promise.all(
      [...new Set(repoIds)].map((repoId) => openChatTurnsForRepo(db, repoId)),
    )
  ).flat();
  return {
    openIds: await idsOfTurns(db, turns),
    awaitingAnswerIds: await awaitingAnswerIdsOf(db, turns),
  };
}

async function awaitingAnswerIdsOf(
  db: DatabaseReader,
  turns: ReadonlyArray<Doc<"turns">>,
): Promise<ReadonlySet<string>> {
  const asking = await Promise.all(
    turns.map(async (turn) => {
      const rows = await db
        .query("pendingQuestions")
        .withIndex("by_entity", (q) => q.eq("entityId", String(turn.entityId)))
        .collect();
      return rows.some((row) => row.answer === undefined) ? turn : null;
    }),
  );
  return idsOfTurns(
    db,
    asking.filter((turn) => turn !== null),
  );
}

/** Open chat turns in one repo. A lane turn (summary, interview) is a one-shot agent, not a chat turn. */
async function openChatTurnsForRepo(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
): Promise<Doc<"turns">[]> {
  const turns = await db
    .query("turns")
    .withIndex("by_repo_open", (q) => q.eq("repoId", repoId).eq("open", true))
    .collect();
  return turns.filter((turn) => turn.lane === undefined);
}

/**
 * A turn lights up its entity and its session. A task's or project's session
 * also lights up its owner (its card is where that chat lives), and a project
 * task's own chat lights up that task. One point read per distinct open-turn
 * session (and per open chat turn in a project's session), never one per
 * list row.
 */
async function idsOfTurns(
  db: DatabaseReader,
  turns: ReadonlyArray<Doc<"turns">>,
): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  const sessionIds = new Set<Id<"sessions">>();
  for (const turn of turns) {
    ids.add(String(turn.entityId));
    if (turn.sessionId !== undefined) {
      ids.add(String(turn.sessionId));
      sessionIds.add(turn.sessionId);
    }
  }
  const sessions = new Map(
    (await Promise.all([...sessionIds].map((id) => db.get(id))))
      .filter((session) => session !== null)
      .map((session) => [String(session._id), session]),
  );
  // Only an owned session's chats can speak for an owner (`chatOwner`).
  const ownedTurns = turns.filter((turn) => {
    const session = sessions.get(String(turn.sessionId));
    return session !== undefined && sessionOwnerEntityId(session) !== undefined;
  });
  const chats = await Promise.all(
    ownedTurns.map((turn) => {
      const chatId = db.normalizeId("sessionChats", turn.entityId);
      return chatId ? db.get(chatId) : null;
    }),
  );
  ownedTurns.forEach((turn, index) => {
    const session = sessions.get(String(turn.sessionId));
    if (!session) return;
    const chat = chats[index];
    // A run's turn (no chat) lights up the session's owner.
    const ownerId = chat
      ? chatOwnerEntityId(chat, session)
      : sessionOwnerEntityId(session);
    if (ownerId) ids.add(String(ownerId));
  });
  return ids;
}

/** True while one named chat entity has a turn open. */
export async function hasOpenChatTurn(
  db: DatabaseReader,
  entityId: Doc<"turns">["entityId"] | Id<"agentTasks">,
): Promise<boolean> {
  // A quick task or a project chats (and runs) through its session: those
  // turns count too. A project task chats in its own chat of the project's
  // session: that chat's turn counts.
  const taskId = db.normalizeId("agentTasks", entityId);
  const projectId = db.normalizeId("projects", entityId);
  const task = taskId ? await db.get(taskId) : null;
  if (task?.projectId !== undefined) {
    const taskChat = await findProjectTaskChat(db, task._id);
    if (taskChat && (await hasOpenChatTurn(db, taskChat._id))) return true;
  }
  const ownedSession = taskId
    ? await findTaskSession(db, taskId)
    : projectId
      ? await findProjectSession(db, projectId)
      : null;
  const sessionId = ownedSession?._id ?? db.normalizeId("sessions", entityId);
  if (sessionId) {
    // A session runs through its chats: any chat's open turn counts.
    const chatTurn = await db
      .query("turns")
      .withIndex("by_session_open", (q) =>
        q.eq("sessionId", sessionId).eq("open", true),
      )
      .first();
    if (chatTurn !== null) return true;
  }
  // A task owns no turn of its own: its chat and runs are covered above.
  const turnEntityId = taskId ? null : turnOwnerId(db, entityId);
  if (turnEntityId === null) return false;
  const turn = await db
    .query("turns")
    .withIndex("by_entity_open", (q) =>
      q.eq("entityId", turnEntityId).eq("lane", undefined).eq("open", true),
    )
    .first();
  return turn !== null;
}

/** `id` as a turn owner, or null for an id of another table. */
function turnOwnerId(
  db: DatabaseReader,
  id: string,
): Doc<"turns">["entityId"] | null {
  return (
    db.normalizeId("sessionChats", id) ??
    db.normalizeId("sessions", id) ??
    db.normalizeId("projects", id) ??
    db.normalizeId("agentRuns", id) ??
    db.normalizeId("automationRuns", id) ??
    db.normalizeId("docs", id) ??
    db.normalizeId("evaluationReports", id)
  );
}

/** The open-turn set for one entity, in the shape the projections take. */
export async function openChatEntityIdsFor(
  db: DatabaseReader,
  entityId: Doc<"turns">["entityId"] | Id<"agentTasks">,
): Promise<ReadonlySet<string>> {
  return new Set(
    (await hasOpenChatTurn(db, entityId)) ? [String(entityId)] : [],
  );
}

/**
 * Whether a session is mid-turn: one of its chats has a turn open. The open
 * turn is the only signal; synthetic (`/loop`) turns open one too.
 */
export function sessionIsExecuting(
  session: Pick<Doc<"sessions">, "_id">,
  openChatEntityIds: ReadonlySet<string>,
): boolean {
  return openChatEntityIds.has(String(session._id));
}

/**
 * The workflow that runs an entity's open turn in one lane. Undefined when
 * the entity is idle or its open turn is synthetic (daemon-minted, no
 * workflow). Session chats and the session summary keep no workflow slot of
 * their own: cancel, completion and the stall backstop read it here.
 */
export async function openTurnWorkflowId(
  ctx: QueryCtx,
  entityId: TurnEntityId,
  lane?: TurnLane,
): Promise<string | undefined> {
  return (await findOpenTurn(ctx, entityId, lane))?.workflowId;
}

/**
 * One "sandbox busy" status for a quick task: its main run and its chat turn
 * share one sandbox, and the queue already treats them as exclusive.
 */
export function taskIsExecuting(
  task: Pick<Doc<"agentTasks">, "_id"> & TaskRunSource,
  openChatEntityIds: ReadonlySet<string>,
): boolean {
  return isTaskRunning(task) || openChatEntityIds.has(String(task._id));
}

/** A project adds a build workflow to the same pair of slots. */
export function projectIsExecuting(
  project: Pick<Doc<"projects">, "_id"> &
    ProjectBuildSource &
    ProjectInterviewSource,
  openChatEntityIds: ReadonlySet<string>,
): boolean {
  return (
    isProjectInterviewing(project) ||
    isProjectBuilding(project) ||
    openChatEntityIds.has(String(project._id))
  );
}
