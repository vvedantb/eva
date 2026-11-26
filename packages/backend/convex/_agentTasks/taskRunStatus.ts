import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { findWorkSession } from "../_sessions/owner";
import { findMainChat } from "../_sessionChats/helpers";

/**
 * The status side of a task's task-mode turns (`taskRunTurn.ts`), for quick
 * and project tasks alike: what the card, the inbox, the scheduler and the
 * Run button read, and the status change when a turn opens or ends. Reads,
 * plus those patches and scheduler calls, so `closeTurn` can call it.
 *
 * A task that ran before runs became chat turns has no task-mode turn yet;
 * its outcome is read off its newest `agentRuns` row instead
 * (`lastTaskRunOutcome`), so a failed old run still halts it.
 */

/** How a task's latest run ended, from a turn or (old tasks) a run row. */
export type TaskRunOutcome = {
  /** Stable id for wake-up keys: the turn's, or the old run's. */
  id: string;
  state: "done" | "error" | "cancelled";
  startedAt: number;
  finishedAt: number;
  error?: string;
  /** A usage limit stopped it (the reply's or run's `errorType`). */
  usageLimited: boolean;
  limitResetAt?: number;
};

/** The task's own session's closed reply turns (no side lanes), newest first. */
async function* closedReplyTurns(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): AsyncGenerator<Doc<"turns">> {
  const turns = db
    .query("turns")
    .withIndex("by_session_open", (q) =>
      q.eq("sessionId", sessionId).eq("open", false),
    )
    .order("desc");
  for await (const turn of turns) {
    if (turn.lane === undefined) yield turn;
  }
}

/** Whether the session has an open reply turn (summary and interview lanes are side jobs). */
async function hasOpenReplyTurn(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): Promise<boolean> {
  const open = await db
    .query("turns")
    .withIndex("by_session_open", (q) =>
      q.eq("sessionId", sessionId).eq("open", true),
    )
    .collect();
  return open.some((turn) => turn.lane === undefined);
}

/** A closed task-mode turn as an outcome; its reply carries the usage limit. */
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
 * closed task-mode turn; for a task with none yet, its newest settled run.
 */
export async function lastTaskRunOutcome(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<TaskRunOutcome | null> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (session) {
    for await (const turn of closedReplyTurns(db, session._id)) {
      if (turn.taskRun !== undefined) return await turnOutcome(db, turn);
    }
  }
  const run = await db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .order("desc")
    .first();
  if (!run || run.status === "queued" || run.status === "running") return null;
  const startedAt = run.startedAt ?? run._creationTime;
  return {
    id: String(run._id),
    state:
      run.status === "success"
        ? "done"
        : run.status === "cancelled"
          ? "cancelled"
          : "error",
    startedAt,
    finishedAt: run.finishedAt ?? startedAt,
    error: run.error,
    usageLimited: run.errorType === "rate_limit",
    limitResetAt: run.limitResetAt,
  };
}

/**
 * When the task's last run failed, if that is still its latest outcome: the
 * newest finished reply turn is a failed task-mode turn and none is open. A
 * later chat reply or run clears it.
 */
export async function taskRunFailedAt(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<number | null> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (!session || (await hasOpenReplyTurn(db, session._id))) return null;
  for await (const turn of closedReplyTurns(db, session._id)) {
    if (turn.taskRun === undefined || turn.state !== "error") return null;
    return turn.finishedAt ?? turn.turnStartedAt;
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

/** Whether the task has ever had a task-mode turn (else it is read off old runs). */
export async function hasTaskRunTurn(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  const session = await findWorkSession(db, { kind: "task", task });
  if (!session) return false;
  for (const open of [true, false]) {
    const turns = db
      .query("turns")
      .withIndex("by_session_open", (q) =>
        q.eq("sessionId", session._id).eq("open", open),
      );
    for await (const turn of turns) {
      if (turn.taskRun !== undefined) return true;
    }
  }
  return false;
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

/** The task a session serves, or null for any other session. */
async function sessionTask(
  db: DatabaseReader,
  sessionId: Id<"sessions"> | undefined,
): Promise<Doc<"agentTasks"> | null> {
  if (sessionId === undefined) return null;
  const owner = (await db.get(sessionId))?.owner;
  if (owner?.kind !== "task") return null;
  return await db.get(owner.taskId);
}

/** The task's open question to its coordinator, filed at or after `since`. */
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
  // The reply lands before the turn closes, so a usage limit is on it now.
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
