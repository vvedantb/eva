import { v } from "convex/values";
import {
  internalMutation,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  authQuery,
  getProjectWithAccess,
  hasActiveRun,
  listProjectTasksForUser,
  normalizeIdOrThrow,
} from "../functions";
import { projectTaskReportFields } from "../validators";
import { isEntityArchived } from "../numId";
import { sessionOwner, findOwnedSession } from "../_sessions/owner";
import type { SessionChatContext } from "../_sessionChats/helpers";
import { requestCoordinatorWake } from "./coordinatorWake";
import { taskLabel } from "./scheduler";
import { startTaskRunTurn } from "../_agentTasks/taskRunTurn";
import { hasActiveTaskRun } from "../_agentTasks/taskRunStatus";
import { dropComposerUserRow } from "../_queues/helpers";
import { chatMessageRoute, mentionsEva } from "@eva/shared";
import { extractMentionedUserIds } from "../_mentions/extractMentionedUserIds";

/**
 * Hub awareness between a project's coordinator and its child tasks
 * (decision 14, plan step 6.6). A child task reports up with
 * `report_to_coordinator`: a `report` is a note and the task keeps working;
 * an `ask` is a question.
 *
 * The ask rules:
 * 1. The task's turn ends (the tool tells the agent to stop). A run that
 *    ended on its ask is a normal outcome, never an error: the task stays
 *    `in_progress` (`onTaskRunTurnClosed`) and reads as waiting, not failed
 *    (`projectTaskFacts`).
 * 2. An ask wakes the coordinator at once (`requestCoordinatorWake`).
 * 3. The coordinator answers with `send_chat_message`
 *    (`answerAskAsCoordinator`): the answer is the task's next run's chat
 *    message (`resumeWithAnswer`), and the agent gets it in its prompt. If it cannot answer, the task shows "needs you"
 *    once its turn ended (`openAskHolder` in the scheduler) and a person
 *    answers. An answer is taken only when the run can start, so a refused
 *    answer leaves the ask open.
 * 4. A person can always answer in the task chat (`routePersonChatMessage`).
 *    The first answer wins: it marks the ask answered, so a late coordinator
 *    answer is refused and starts no second run.
 * 5. One open ask for each task: a second is refused.
 * 6. No timeout: an unanswered ask stays open.
 * 7. Stopping or cancelling the task closes it (`closeTaskReports`).
 * 8. Asks and reports are rows, so the card state comes from data.
 */

/** Longest report or ask text kept; the rest is cut. */
export const MAX_TASK_REPORT_CHARS = 4_000;

/** The task's open ask, or null. */
export async function findOpenAsk(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
): Promise<Doc<"projectTaskReports"> | null> {
  const open = await db
    .query("projectTaskReports")
    .withIndex("by_task_and_state", (q) =>
      q.eq("taskId", taskId).eq("state", "open"),
    )
    .collect();
  return open.find((row) => row.kind === "ask") ?? null;
}

/**
 * Whether the task filed an ask (open, answered or closed) at or after
 * `since`, a run's start: that run ended on its question.
 */
export async function askFiledDuring(
  db: DatabaseReader,
  taskId: Id<"agentTasks">,
  since: number,
): Promise<boolean> {
  const rows = await db
    .query("projectTaskReports")
    .withIndex("by_task_and_state", (q) => q.eq("taskId", taskId))
    .collect();
  return rows.some((row) => row.kind === "ask" && row.createdAt >= since);
}

/**
 * True when the task's run ended on an ask it filed during that run: the
 * open ask is newer than the run's start. An older open ask (a person
 * restarted the task without answering) does not count.
 */
export async function runEndedOnAsk(
  db: DatabaseReader,
  run: Pick<Doc<"agentRuns">, "taskId" | "startedAt">,
): Promise<boolean> {
  const ask = await findOpenAsk(db, run.taskId);
  return ask !== null && ask.createdAt >= (run.startedAt ?? 0);
}

/**
 * Files a child task's report or ask. Refuses a second open ask (rule 5).
 * An ask wakes the coordinator at once (rule 2); a report waits for its next
 * turn.
 */
export async function fileTaskReport(
  ctx: MutationCtx,
  params: {
    task: Doc<"agentTasks">;
    kind: Doc<"projectTaskReports">["kind"];
    text: string;
  },
): Promise<Id<"projectTaskReports">> {
  const { task, kind } = params;
  if (task.projectId === undefined) {
    throw new Error("Only a project's task reports to a coordinator.");
  }
  const text = params.text.trim().slice(0, MAX_TASK_REPORT_CHARS);
  if (!text) throw new Error("A report needs text.");
  if (kind === "ask" && (await findOpenAsk(ctx.db, task._id))) {
    throw new Error(
      "This task already has an open question. Wait for its answer.",
    );
  }
  const reportId = await ctx.db.insert("projectTaskReports", {
    projectId: task.projectId,
    taskId: task._id,
    kind,
    text,
    state: "open",
    createdAt: Date.now(),
  });
  if (kind === "ask") {
    await requestCoordinatorWake(ctx, {
      projectId: task.projectId,
      reason: "ask",
      key: `ask:${reportId}`,
      text: `Task ${taskLabel(task)} (id ${task._id}) asks: ${text}\nAnswer it with send_chat_message to that task. If you cannot, say so here so a person answers.`,
    });
  }
  return reportId;
}

/** Marks the task's open ask answered (rule 4); null when none is open. */
async function answerOpenAsk(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  answeredBy: "coordinator" | Id<"users">,
): Promise<Doc<"projectTaskReports"> | null> {
  const ask = await findOpenAsk(ctx.db, taskId);
  if (!ask) return null;
  await ctx.db.patch(ask._id, {
    state: "answered",
    answeredBy,
    answeredAt: Date.now(),
  });
  return ask;
}

/** Closes every open ask and report of a stopped or cancelled task (rule 7). */
export async function closeTaskReports(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const open = await ctx.db
    .query("projectTaskReports")
    .withIndex("by_task_and_state", (q) =>
      q.eq("taskId", taskId).eq("state", "open"),
    )
    .collect();
  for (const row of open) await ctx.db.patch(row._id, { state: "closed" });
}

/** The prompt note that hands an answer to the task's next run. */
function answerNote(
  ask: Pick<Doc<"projectTaskReports">, "text">,
  from: string,
  answer: string,
): string {
  return `You asked: ${ask.text}\nThe answer from ${from}:\n${answer.trim()}\nGo on with the task.`;
}

/**
 * Whether the task's next run can be asked for now: the task is live and no
 * run is going or queued. A chat turn still replying just runs first: the
 * run waits behind it in the queue. Checked before an answer is taken, so a
 * refused answer changes nothing.
 */
async function canResumeAskingTask(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  if (isEntityArchived(task) || task.status === "cancelled") return false;
  // A run started before runs became chat turns may still be going.
  if (await hasActiveRun(ctx.db, task._id)) return false;
  return !(await hasActiveTaskRun(ctx.db, task));
}

/**
 * Starts the task's next run with an answer: the answer is the run's chat
 * message, and the agent gets the task prompt with the answer note. A start
 * that fails is logged; the ask stays answered and a person can run the task.
 */
async function resumeWithAnswer(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  p: {
    userId: Id<"users">;
    answer: string;
    note: string;
    sentViaOrchestrator?: boolean;
  },
): Promise<void> {
  try {
    await startTaskRunTurn(ctx, task, {
      userId: p.userId,
      note: p.note,
      displayContent: p.answer,
      sentViaOrchestrator: p.sentViaOrchestrator,
    });
  } catch (error) {
    console.error(
      `[project-reports] task=${task._id} did not resume: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * What happened to a person's chat message (`routePersonChatMessage`).
 * - `answered`: it answered a project task's open ask; that task's next run
 *   starts with it.
 * - `posted`: a quiet comment in a coordinator chat (it `@`-mentions only
 *   teammates): stored, no Eva turn.
 * - `continue`: neither; the caller runs or queues the turn as usual.
 */
export type PersonChatRoute = "answered" | "posted" | "continue";

/**
 * A person sent `message` in a session chat. In a child task's chat with an
 * open ask, the message is the answer: the ask closes and the task's next run
 * starts with it. In a coordinator's chat, a message for teammates only stays
 * a quiet comment (`chatMessageRoute`); any other message wakes Eva.
 * `insertUserRow`: the caller has not stored the message.
 */
export async function routePersonChatMessage(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    userId: Id<"users">;
    message: string;
    insertUserRow: boolean;
  },
): Promise<PersonChatRoute> {
  const { chat, session } = params.context;
  const owner = sessionOwner(session);
  const insertUserRow = async () => {
    if (!params.insertUserRow) return;
    await ctx.db.insert("messages", {
      parentId: chat._id,
      role: "user",
      content: params.message,
      timestamp: Date.now(),
      userId: params.userId,
    });
  };
  if (owner.kind === "project") {
    const mentionedPeople = extractMentionedUserIds(
      ctx,
      params.message,
    ).filter((id) => id !== params.userId).length;
    const route = chatMessageRoute({
      mentionsEva: mentionsEva(params.message),
      mentionedPeople,
    });
    if (route === "quiet") {
      await insertUserRow();
      return "posted";
    }
    return "continue";
  }
  if (owner.kind !== "task") return "continue";
  const task = await ctx.db.get(owner.taskId);
  if (!task?.projectId) return "continue";
  const ask = await findOpenAsk(ctx.db, task._id);
  if (!ask || !(await canResumeAskingTask(ctx, task))) return "continue";
  await answerOpenAsk(ctx, task._id, params.userId);
  // The answer is the run's own chat message: the composer's stored row goes,
  // as for any queued send, and the queue writes it back when the run starts.
  if (!params.insertUserRow) {
    await dropComposerUserRow(ctx, chat._id, params.message);
  }
  await resumeWithAnswer(ctx, task, {
    userId: params.userId,
    answer: params.message,
    note: answerNote(ask, "a person", params.message),
  });
  return "answered";
}

/**
 * The coordinator's `send_chat_message` to one of its tasks.
 * - `answered`: the task had an open ask; this message answered it and the
 *   task's next run started (or will, on its next event).
 * - `answered_by_person`: a person answered the task's question after the
 *   coordinator's last finished turn. The message is not sent, so it starts
 *   no second run (rule 4).
 * - `none`: no ask involved; the caller delivers the message as usual.
 */
export const answerAskAsCoordinator = internalMutation({
  args: {
    taskId: v.string(),
    projectId: v.string(),
    userId: v.string(),
    message: v.string(),
  },
  returns: v.union(
    v.literal("answered"),
    v.literal("answered_by_person"),
    v.literal("none"),
  ),
  handler: async (ctx, args) => {
    const taskId = normalizeIdOrThrow(ctx.db, "agentTasks", args.taskId, "Task");
    const userId = normalizeIdOrThrow(ctx.db, "users", args.userId, "User");
    const task = await ctx.db.get(taskId);
    if (!task || String(task.projectId) !== args.projectId) {
      throw new Error("That task is not part of this project.");
    }
    const open = await findOpenAsk(ctx.db, task._id);
    if (open && !(await canResumeAskingTask(ctx, task))) {
      throw new Error(
        "The task cannot start its next run now. Try again in a moment.",
      );
    }
    const ask = open ? await answerOpenAsk(ctx, task._id, "coordinator") : null;
    if (ask) {
      await resumeWithAnswer(ctx, task, {
        userId,
        answer: args.message,
        note: answerNote(ask, "the project coordinator", args.message),
        sentViaOrchestrator: true,
      });
      return "answered";
    }
    const latestAsk = (
      await ctx.db
        .query("projectTaskReports")
        .withIndex("by_task_and_state", (q) =>
          q.eq("taskId", task._id).eq("state", "answered"),
        )
        .collect()
    )
      .filter((row) => row.kind === "ask")
      .sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))[0];
    if (latestAsk && latestAsk.answeredBy !== "coordinator") {
      const coordinator = task.projectId
        ? await findOwnedSession(ctx.db, {
            kind: "project",
            projectId: task.projectId,
          })
        : null;
      if ((latestAsk.answeredAt ?? 0) > (coordinator?.lastTurnFinishedAt ?? 0)) {
        return "answered_by_person";
      }
    }
    return "none";
  },
});

/** `report_to_coordinator`: files a child task's report or ask. */
export const fileReportFromTask = internalMutation({
  args: {
    taskId: v.string(),
    kind: projectTaskReportFields.kind,
    text: v.string(),
  },
  returns: v.id("projectTaskReports"),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(
      normalizeIdOrThrow(ctx.db, "agentTasks", args.taskId, "Task"),
    );
    if (!task || isEntityArchived(task)) throw new Error("Task not found");
    return await fileTaskReport(ctx, {
      task,
      kind: args.kind,
      text: args.text,
    });
  },
});

const reportValidator = v.object({
  _id: v.id("projectTaskReports"),
  _creationTime: v.number(),
  ...projectTaskReportFields,
});

/**
 * Every report and ask of the project's tasks, newest first, for the task
 * cards. Rows of a task in a repo the caller cannot open are left out.
 */
export const listTaskReports = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(reportValidator),
  handler: async (ctx, args) => {
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
    const visible = new Set(
      (await listProjectTasksForUser(ctx.db, args.projectId, ctx.userId))
        .filter((row) => row.canAccess)
        .map((row) => String(row.task._id)),
    );
    const rows = await ctx.db
      .query("projectTaskReports")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return rows.filter((row) => visible.has(String(row.taskId)));
  },
});
