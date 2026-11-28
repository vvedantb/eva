import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { findWorkSession } from "../_sessions/owner";
import { findMainChat } from "../_sessionChats/helpers";

/** How a task's latest run (its newest closed task-mode turn) ended. */
export type TaskRunOutcome = {
  id: string;
  state: "done" | "error" | "cancelled";
  startedAt: number;
  finishedAt: number;
  error?: string;
  usageLimited: boolean;
  limitResetAt?: number;
};

function closedReplyTurns(db: DatabaseReader, sessionId: Id<"sessions">) {
  return db
    .query("turns")
    .withIndex("by_session_open", (q) =>
      q.eq("sessionId", sessionId).eq("open", false),
    )
    .order("desc");
}

async function hasOpenReplyTurn(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): Promise<boolean> {
  const open = await db
    .query("turns")
    .withIndex("by_session_open", (q) =>
      q.eq("sessionId", sessionId).eq("open", true),
    )
    .first();
  return open !== null;
}

async function turnOutcome(
  db: DatabaseReader,
  turn: Doc<"turns">,
): Promise<TaskRunOutcome> {
  const reply =
    turn.placeholderMessageId !== undefined
      ? await db.get(turn.placeholderMessageId)
      : null;
  return {
    id: String(turn._id),
    state:
      turn.state === "done"
        ? "done"
        : turn.state === "cancelled"
          ? "cancelled"
          : "error",
    startedAt: turn.turnStartedAt,
    finishedAt: turn.finishedAt ?? turn.turnStartedAt,
    error: turn.error ?? reply?.content,
    usageLimited: reply?.errorType === "rate_limit",
    limitResetAt: reply?.limitResetAt,
  };
}

/**
 * How the task's latest run ended, or null before its first. Its newest
 * closed task-mode turn.
 */
export async function lastTaskRunOutcome(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<TaskRunOutcome | null> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (!session) return null;
  for await (const turn of closedReplyTurns(db, session._id)) {
    if (turn.taskRun !== undefined) return await turnOutcome(db, turn);
  }
  return null;
}

/** The task's last run failed: when, and the turn's error if it kept one. */
export type TaskRunFailure = { at: number; error?: string };

/**
 * The task's last run failure, if that is still its latest outcome: the
 * newest finished reply turn is a failed task-mode turn and none is open. A
 * later chat reply or run clears it. The error is the turn's own, so no
 * extra read for its reply.
 */
export async function taskRunFailure(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<TaskRunFailure | null> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (!session || (await hasOpenReplyTurn(db, session._id))) return null;
  for await (const turn of closedReplyTurns(db, session._id)) {
    if (turn.taskRun === undefined || turn.state !== "error") return null;
    return { at: turn.finishedAt ?? turn.turnStartedAt, error: turn.error };
  }
  return null;
}

/** One finished run of a task, as the analytics count it. */
export type FinishedTaskRun = {
  startedAt: number;
  finishedAt: number;
  succeeded: boolean;
};

/** The task's finished task-mode turns (its runs), oldest first. */
export async function listFinishedTaskRuns(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<FinishedTaskRun[]> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (!session) return [];
  const runs: FinishedTaskRun[] = [];
  for await (const turn of closedReplyTurns(db, session._id)) {
    if (turn.taskRun === undefined) continue;
    runs.push({
      startedAt: turn.turnStartedAt,
      finishedAt: turn.finishedAt ?? turn.turnStartedAt,
      succeeded: turn.state === "done",
    });
  }
  return runs.reverse();
}

/** The task's open or queued task-mode run, if any. */
export async function hasActiveTaskRun(
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

async function sessionTask(
  db: DatabaseReader,
  sessionId: Id<"sessions"> | undefined,
): Promise<Doc<"agentTasks"> | null> {
  if (sessionId === undefined) return null;
  const owner = (await db.get(sessionId))?.owner;
  if (owner?.kind !== "task") return null;
  return await db.get(owner.taskId);
}

async function askFiledSince(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
  since: number,
): Promise<Doc<"projectTaskReports"> | null> {
  const open = await db
    .query("projectTaskReports")
    .withIndex("by_task_and_state", (q) =>
      q.eq("taskId", taskId).eq("state", "open"),
    )
    .collect();
  return (
    open.find((row) => row.kind === "ask" && row.createdAt >= since) ?? null
  );
}

/**
 * The start of a task-mode turn: a To Do task is in progress again. Covers
 * a Run that waited in the queue and a retried Run.
 */
export async function onTaskRunTurnOpened(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<void> {
  const task = await sessionTask(ctx.db, sessionId);
  if (task?.status !== "todo") return;
  await ctx.db.patch(task._id, {
    status: "in_progress",
    updatedAt: Date.now(),
  });
}

/**
 * The end of a task-mode turn, from `closeTurn`: every way a turn ends passes
 * there (reply, error, Stop, stall).
 * - A turn that filed a question to its coordinator is waiting: the task
 *   stays In Progress until the answer starts its next run.
 * - Otherwise In Progress moves to Review on success and to To Do on
 *   anything else. A status a person picked during the run stays.
 * - A project task also: a stopped one closes its open questions; the
 *   project's scheduler looks again (next tasks, coordinator wake-ups), and
 *   once more at a usage limit's reset.
 */
export async function onTaskRunTurnClosed(
  ctx: MutationCtx,
  turn: Doc<"turns">,
  state: Doc<"turns">["state"],
): Promise<void> {
  const task = await sessionTask(ctx.db, turn.sessionId);
  if (!task) return;
  const waiting =
    state !== "cancelled" &&
    (await askFiledSince(ctx.db, task._id, turn.turnStartedAt)) !== null;
  if (task.status === "in_progress" && !waiting) {
    await ctx.db.patch(task._id, {
      status: state === "done" ? "business_review" : "todo",
      updatedAt: Date.now(),
    });
  }
  const projectId = task.projectId;
  if (projectId === undefined) return;
  if (state === "cancelled") {
    const open = await ctx.db
      .query("projectTaskReports")
      .withIndex("by_task_and_state", (q) =>
        q.eq("taskId", task._id).eq("state", "open"),
      )
      .collect();
    for (const row of open) await ctx.db.patch(row._id, { state: "closed" });
  }
  const reply =
    turn.placeholderMessageId !== undefined
      ? await ctx.db.get(turn.placeholderMessageId)
      : null;
  await ctx.scheduler.runAfter(0, internal.buildWorkflow.scheduleReadyTasks, {
    projectId,
  });
  if (
    reply?.errorType === "rate_limit" &&
    reply.limitResetAt !== undefined &&
    reply.limitResetAt > Date.now()
  ) {
    await ctx.scheduler.runAt(
      reply.limitResetAt,
      internal.buildWorkflow.scheduleReadyTasks,
      { projectId },
    );
  }
}
