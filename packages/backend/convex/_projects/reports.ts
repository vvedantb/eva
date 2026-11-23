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
import { isEntityDeleted } from "../numId";
import { chatOwner, findOwnedSession } from "../_sessions/owner";
import { ensureTaskChat } from "../_sessions/ownedSession";
import type { SessionChatContext } from "../_sessionChats/helpers";
import {
  releaseHeldCoordinatorWakes,
  requestCoordinatorWake,
} from "./coordinatorWake";
import { startProjectTask, taskLabel } from "./scheduler";
import { taskWorkSessionBusy } from "../_taskWorkflow/startRun";

/**
 * Hub awareness between a project's coordinator and its child tasks
 * (decision 14, plan step 6.6). A child task reports up with
 * `report_to_coordinator`: a `report` is a note and the task keeps working;
 * an `ask` is a question.
 *
 * The ask rules:
 * 1. The task's turn ends (the tool tells the agent to stop). Its run then
 *    ends without moving the task: it stays `in_progress` and keeps its
 *    parallel slot (`completeRun`), and reads as waiting, not failed.
 * 2. An ask wakes the coordinator at once (`requestCoordinatorWake`).
 * 3. The coordinator answers with `send_chat_message`
 *    (`answerAskAsCoordinator`), which starts the task's next run with the
 *    answer in its prompt. If it cannot answer, the task shows "needs you"
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
 * Whether the task's next run can start now: the task is live and nothing
 * holds its session. Checked before an answer is taken, so a refused answer
 * changes nothing.
 */
async function canResumeAskingTask(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  if (isEntityDeleted(task) || task.status === "cancelled") return false;
  if (await hasActiveRun(ctx.db, task._id)) return false;
  return !(await taskWorkSessionBusy(ctx.db, task));
}

/**
 * A person sent `message` in a session chat. In a child task's chat with an
 * open ask, the message is the answer: the ask closes and the task's next run
 * starts with it (true; the caller sends nothing more). In a coordinator's
 * chat, wake-ups the hourly cap held are folded into this turn. Otherwise
 * nothing (false). `insertUserRow`: the caller has not stored the message.
 */
export async function routePersonChatMessage(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    userId: Id<"users">;
    message: string;
    insertUserRow: boolean;
  },
): Promise<boolean> {
  const { chat, session } = params.context;
  const owner = chatOwner(chat, session);
  if (owner.kind === "project") {
    await releaseHeldCoordinatorWakes(ctx, owner.projectId);
    return false;
  }
  if (owner.kind !== "task") return false;
  const task = await ctx.db.get(owner.taskId);
  if (!task?.projectId) return false;
  const ask = await findOpenAsk(ctx.db, task._id);
  if (!ask || !(await canResumeAskingTask(ctx, task))) return false;
  await answerOpenAsk(ctx, task._id, params.userId);
  if (params.insertUserRow) {
    await ctx.db.insert("messages", {
      parentId: chat._id,
      role: "user",
      content: params.message,
      timestamp: Date.now(),
      userId: params.userId,
    });
  }
  // A failed start shows on the task as a failed run (`startTaskRun`).
  await startProjectTask(ctx, task, answerNote(ask, "a person", params.message));
  return true;
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
      const { chat } = await ensureTaskChat(ctx, task);
      await ctx.db.insert("messages", {
        parentId: chat._id,
        role: "user",
        content: args.message,
        timestamp: Date.now(),
        userId,
        sentViaOrchestrator: true,
      });
      await startProjectTask(
        ctx,
        task,
        answerNote(ask, "the project coordinator", args.message),
      );
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
    if (!task || isEntityDeleted(task)) throw new Error("Task not found");
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
