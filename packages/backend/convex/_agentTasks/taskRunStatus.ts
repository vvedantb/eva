import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { findWorkSession } from "../_sessions/owner";
import { findMainChat } from "../_sessionChats/helpers";

/**
 * The status side of a quick task's task-mode turns (`taskRunTurn.ts`): what
 * the card, the inbox and the Run button read, and the status change when a
 * turn ends. Reads only, plus that one patch, so `closeTurn` can call it.
 */

/**
 * The task session's newest finished reply turn (summary and interview lanes
 * are side jobs), or null while a reply turn is open.
 */
async function latestClosedReplyTurn(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<Doc<"turns"> | null> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (!session) return null;
  const turns = (open: boolean) =>
    db
      .query("turns")
      .withIndex("by_session_open", (q) =>
        q.eq("sessionId", session._id).eq("open", open),
      )
      .order("desc");
  for await (const turn of turns(true)) {
    if (turn.lane === undefined) return null;
  }
  for await (const turn of turns(false)) {
    if (turn.lane === undefined) return turn;
  }
  return null;
}

/**
 * When the task's last run failed, if that is still its latest outcome: the
 * newest finished reply turn is a failed task-mode turn and none is open. A
 * later chat reply or run clears it.
 */
export async function quickTaskRunFailedAt(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<number | null> {
  const turn = await latestClosedReplyTurn(db, task);
  if (turn?.taskRun === undefined || turn.state !== "error") return null;
  return turn.finishedAt ?? turn.turnStartedAt;
}


/** The task's open or queued run, if any. */
export async function hasActiveQuickTaskRun(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (!session) return false;
  const openTurns = await db
    .query("turns")
    .withIndex("by_session_open", (q) =>
      q.eq("sessionId", session._id).eq("open", true),
    )
    .collect();
  if (openTurns.some((turn) => turn.taskRun !== undefined)) return true;
  const chat = await findMainChat(db, session._id);
  if (!chat) return false;
  const queued = await db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", chat._id))
    .collect();
  return queued.some((row) => row.taskRun !== undefined);
}

/** The quick task a session serves, or null for any other session. */
async function sessionQuickTask(
  db: DatabaseReader,
  sessionId: Id<"sessions"> | undefined,
): Promise<Doc<"agentTasks"> | null> {
  if (sessionId === undefined) return null;
  const owner = (await db.get(sessionId))?.owner;
  if (owner?.kind !== "task") return null;
  const task = await db.get(owner.taskId);
  return task && task.projectId === undefined ? task : null;
}

/**
 * The start of a task-mode turn: a To Do task is in progress again. Covers
 * a Run that waited in the queue and a retried Run.
 */
export async function onTaskRunTurnOpened(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<void> {
  const task = await sessionQuickTask(ctx.db, sessionId);
  if (task?.status !== "todo") return;
  await ctx.db.patch(task._id, {
    status: "in_progress",
    updatedAt: Date.now(),
  });
}

/**
 * The end of a task-mode turn, from `closeTurn`: every way a turn ends passes
 * there (reply, error, Stop, stall). Moves a task the run left
 * `in_progress` to Review on success and back to To Do otherwise. A status a
 * person picked during the run is theirs and stays.
 */
export async function onTaskRunTurnClosed(
  ctx: MutationCtx,
  turn: Pick<Doc<"turns">, "sessionId">,
  state: Doc<"turns">["state"],
): Promise<void> {
  const task = await sessionQuickTask(ctx.db, turn.sessionId);
  if (task?.status !== "in_progress") return;
  await ctx.db.patch(task._id, {
    status: state === "done" ? "business_review" : "todo",
    updatedAt: Date.now(),
  });
}
