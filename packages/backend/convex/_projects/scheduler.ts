import {
  MAX_COORDINATOR_RETRIES,
  projectTaskStage,
  tasksToStart,
  type ProjectTaskFacts,
} from "@eva/shared/projectStatus";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { filterActiveEntities, isEntityDeleted } from "../numId";
import { isFirstTaskOnBranch } from "../functions";
import { startTaskRun } from "../_taskWorkflow/startRun";
import { latestTaskRun } from "./runSettings";
import { resolveTaskWorkflowBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { findOwnedSession, type OwnedSessionOwner } from "../_sessions/owner";
import {
  ownedSessionBusy,
  syncOwnedSessionWithTaskStatus,
} from "../_sessions/ownedSession";
import { requestCoordinatorWake } from "./coordinatorWake";
import { findOpenAsk } from "./reports";
import { RUN_WAITING_FOR_ANSWER } from "../_taskWorkflow/helpers";

/**
 * The project scheduler: it replaces the old one-at-a-time build. It starts
 * every approved `todo` child task that is not halted and has no run
 * pending, in `taskNumber` order, with no cap on how many run at once. Each task runs like a quick
 * task: its own session, sandbox, branch and PR to main. The rules are the
 * shared ones (`@eva/shared/projectStatus`); this module only loads the facts
 * and starts runs.
 *
 * It runs on these events: the coordinator creates tasks, a person approves
 * or creates one, a child task's status changes (`onProjectTasksChanged`),
 * and a child PR merges (the PR webhook). It is
 * idempotent: a second call on the same state starts nothing.
 */

/** A project's child tasks that are not deleted. */
export async function listProjectTasks(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Doc<"agentTasks">[]> {
  return filterActiveEntities(
    await db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
  );
}

/** What every task's facts read of its project, loaded once. */
export interface ProjectFactsContext {
  project: Pick<Doc<"projects">, "_id" | "providerAccountId">;
  now: number;
  /** When the coordinator last finished a turn while it is idle now; undefined while it is busy or never ran. */
  coordinatorIdleSince?: number;
}

/** Loads the project half of the facts (`ProjectFactsContext`). */
export async function loadProjectFactsContext(
  db: DatabaseReader,
  project: Pick<Doc<"projects">, "_id" | "providerAccountId">,
  now: number,
): Promise<ProjectFactsContext> {
  const owner: OwnedSessionOwner = { kind: "project", projectId: project._id };
  const [session, busy] = await Promise.all([
    findOwnedSession(db, owner),
    ownedSessionBusy(db, owner),
  ]);
  return {
    project,
    now,
    coordinatorIdleSince: busy ? undefined : session?.lastTurnFinishedAt,
  };
}

/**
 * Who must answer the task's open ask now: the coordinator, until it had a
 * turn after the ask and is idle again without answering; then a person.
 */
function openAskHolder(
  ask: Pick<Doc<"projectTaskReports">, "createdAt"> | null,
  context: ProjectFactsContext,
): ProjectTaskFacts["openAsk"] {
  if (!ask) return undefined;
  const passed =
    context.coordinatorIdleSince !== undefined &&
    context.coordinatorIdleSince > ask.createdAt;
  return passed ? "person" : "coordinator";
}

/**
 * One child task as the shared rules read it. Only a `todo` task's latest
 * run matters: a failed or cancelled run puts its task back to `todo`. A
 * task with an open ask is waiting, never halted: its run ended on purpose
 * (`RUN_WAITING_FOR_ANSWER`, not an error). A `todo` task whose latest run
 * ended waiting but whose ask is closed was stopped while it waited
 * (`closeTaskReports`): it is halted as stopped, so nothing restarts it.
 */
export async function projectTaskFacts(
  db: DatabaseReader,
  context: ProjectFactsContext,
  task: Doc<"agentTasks">,
): Promise<ProjectTaskFacts> {
  const { project, now } = context;
  const [latest, ask] = await Promise.all([
    task.status === "todo" ? latestTaskRun(db, task._id) : null,
    findOpenAsk(db, task._id),
  ]);
  const runPending =
    task.run !== undefined ||
    latest?.status === "queued" ||
    latest?.status === "running";
  // The usage limit holds while its reset is ahead and the task would run
  // on the same account again (it copies the project's at its next start).
  const usageLimited =
    latest?.errorType === "rate_limit" &&
    (latest.limitResetAt === undefined || latest.limitResetAt > now) &&
    task.providerAccountId === project.providerAccountId;
  const halted =
    runPending ||
    latest === null ||
    latest.errorType === "rate_limit" ||
    ask !== null
      ? undefined
      : latest.status === "error"
        ? "failed"
        : latest.status === "cancelled" ||
            latest.exitReason === RUN_WAITING_FOR_ANSWER
          ? "cancelled"
          : undefined;
  return {
    id: String(task._id),
    taskNumber: task.taskNumber,
    status: task.status,
    prState: task.prState,
    approved: task.approvedAt !== undefined,
    withCoordinator:
      task.status === "todo" && task.handedToCoordinatorAt !== undefined,
    halted,
    usageLimited,
    runPending,
    coordinatorRetries: task.coordinatorRetries,
    openAsk: openAskHolder(ask, context),
  };
}

/**
 * Starts one child task's run on its own repo (session, branch, GitHub App
 * installation). False when it did not start: a failure here never stops the
 * other tasks. A task whose chat is replying waits for the next event; a
 * workflow that failed to start is marked on its run and shows as failed.
 */
export async function startProjectTask(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  note?: string,
): Promise<boolean> {
  if (task.repoId === undefined) return false;
  const repo = await ctx.db.get(task.repoId);
  if (!repo) return false;
  try {
    await startTaskRun(ctx, {
      task,
      repo,
      userId: task.createdBy,
      baseBranch: resolveTaskWorkflowBaseBranch(task, repo),
      isFirstTaskOnBranch: await isFirstTaskOnBranch(ctx.db, task._id),
      triggeringCommentId: task.pendingChangeRequestCommentId,
      clearPendingChangeRequest: true,
      rollbackStatus: "todo",
      note,
    });
    return true;
  } catch (error) {
    console.error(
      `[project-scheduler] task=${task._id} did not start: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/** Starts the project's ready tasks (see the module comment); returns their ids. */
export async function scheduleReadyProjectTasks(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<Id<"agentTasks">[]> {
  const project = await ctx.db.get(projectId);
  if (!project || isEntityDeleted(project)) return [];
  const [tasks, context] = await Promise.all([
    listProjectTasks(ctx.db, projectId),
    loadProjectFactsContext(ctx.db, project, Date.now()),
  ]);
  const facts = await Promise.all(
    tasks.map((task) => projectTaskFacts(ctx.db, context, task)),
  );
  const byId = new Map(tasks.map((task) => [String(task._id), task]));
  const started: Id<"agentTasks">[] = [];
  for (const id of tasksToStart(facts)) {
    const task = byId.get(id);
    if (task && (await startProjectTask(ctx, task))) started.push(task._id);
  }
  // The same events can need the coordinator: a failure, a finished batch.
  await requestEventWakes(ctx, tasks, facts);
  return started;
}

/**
 * Asks for the coordinator wake-ups the task state calls for (decision 16):
 * a task whose run failed and that the coordinator may still retry (one
 * wake-up for each failed run), and a batch it created whose tasks have all
 * ended: launched, cancelled, or failed after its retry (one for each
 * batch). Idempotent by key, so calling it on every event is safe.
 */
async function requestEventWakes(
  ctx: MutationCtx,
  tasks: readonly Doc<"agentTasks">[],
  facts: readonly ProjectTaskFacts[],
): Promise<void> {
  const projectId = tasks[0]?.projectId;
  if (projectId === undefined) return;
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  for (const task of tasks) {
    const fact = factsById.get(String(task._id));
    if (
      fact?.halted !== "failed" ||
      (task.coordinatorRetries ?? 0) >= MAX_COORDINATOR_RETRIES
    ) {
      continue;
    }
    const run = await latestTaskRun(ctx.db, task._id);
    if (!run) continue;
    await requestCoordinatorWake(ctx, {
      projectId,
      reason: "failed",
      key: `failed:${run._id}`,
      text: `Task ${taskLabel(task)} failed: ${(run.error ?? "no error text").slice(0, 300)}. You may retry it once with retry_task and a note on what to change.`,
    });
  }
  const batches = await ctx.db
    .query("projectTaskBatches")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  for (const batch of batches) {
    const batchFacts = batch.taskIds.flatMap((id) => {
      const fact = factsById.get(String(id));
      return fact ? [fact] : [];
    });
    if (!isBatchFinished(batchFacts)) continue;
    await requestCoordinatorWake(ctx, {
      projectId,
      reason: "batch_done",
      key: `batch:${batch._id}`,
      text: `Every task of the batch you created at ${new Date(batch.createdAt).toISOString()} has ended. Update the summary and create the next tasks if the work goes on.`,
    });
  }
}

/** `#12 "Title"`: how wake-ups and the task table name a task. */
export function taskLabel(
  task: Pick<Doc<"agentTasks">, "taskNumber" | "title">,
): string {
  return `${task.taskNumber !== undefined ? `#${task.taskNumber} ` : ""}"${task.title}"`;
}

/**
 * A batch ended when some of it was approved (the coordinator's tasks are,
 * at creation) and every one of its tasks is launched, cancelled, or failed
 * after the coordinator's retry. A batch with no approved task never ends by
 * itself.
 */
export function isBatchFinished(tasks: readonly ProjectTaskFacts[]): boolean {
  if (tasks.length === 0 || !tasks.some((task) => task.approved)) return false;
  return tasks.every((task) => {
    const stage = projectTaskStage(task);
    if (stage === "launched" || stage === "cancelled") return true;
    return (
      task.halted === "failed" &&
      (task.coordinatorRetries ?? 0) >= MAX_COORDINATOR_RETRIES
    );
  });
}

/**
 * A person approves `taskIds` (todo tasks of this project waiting in Triage)
 * and hands them to the coordinator (decision 4, v2): each is approved and
 * marked `handedToCoordinatorAt`, so the scheduler never starts it; one
 * coordinator wake lists the handed tasks, and the coordinator starts each
 * (`start_task`) or adds it to an open task (`merge_task_into`). Tasks
 * already approved keep their state. Refuses a task of another project.
 * Returns the tasks it handed over.
 */
export async function approveTasks(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  taskIds: readonly Id<"agentTasks">[],
): Promise<Doc<"agentTasks">[]> {
  const now = Date.now();
  const tasks = await Promise.all(taskIds.map((taskId) => ctx.db.get(taskId)));
  const handed: Doc<"agentTasks">[] = [];
  for (const task of tasks) {
    if (!task || task.projectId !== projectId || isEntityDeleted(task)) {
      throw new Error("Task not found in this project");
    }
    if (task.status === "todo" && task.approvedAt === undefined) {
      await ctx.db.patch(task._id, {
        approvedAt: now,
        handedToCoordinatorAt: now,
        updatedAt: now,
      });
      handed.push(task);
    }
  }
  if (handed.length === 0) return handed;
  const authors = await Promise.all(
    handed.map((task) => ctx.db.get(task.createdBy)),
  );
  const lines = handed.map((task, index) => {
    const author = authors[index];
    const by = author?.firstName ?? author?.fullName;
    return `- ${taskLabel(task)}${by ? ` (added by ${by})` : ""}`;
  });
  await requestCoordinatorWake(ctx, {
    projectId,
    reason: "triage",
    key: `triage:${now}:${handed.map((task) => task._id).join(",")}`,
    text: `A person approved ${handed.length === 1 ? "this Triage item" : `these ${handed.length} Triage items`} and handed ${handed.length === 1 ? "it" : "them"} to you. Group them by area: add each to an open task that covers its area (send_chat_message to that task, then merge_task_into), or start it as its own task (start_task). Then reply with where each one went.\n${lines.join("\n")}`,
  });
  return handed;
}

/** A todo task of `projectId`, or an error the coordinator can read. */
async function coordinatorTodoTask(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  taskId: Id<"agentTasks">,
): Promise<Doc<"agentTasks">> {
  const task = await ctx.db.get(taskId);
  if (!task || task.projectId !== projectId || isEntityDeleted(task)) {
    throw new Error("That task is not part of this project.");
  }
  if (task.status !== "todo" || task.approvedAt === undefined) {
    throw new Error(
      "Only an approved task that has not started yet can be started or merged.",
    );
  }
  return task;
}

/**
 * The coordinator starts a Triage item a person handed to it (`start_task`):
 * it stops being held, so the scheduler starts it like any approved task.
 */
export async function startHandedTask(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await coordinatorTodoTask(ctx, projectId, taskId);
  if (task.handedToCoordinatorAt !== undefined) {
    await ctx.db.patch(task._id, {
      handedToCoordinatorAt: undefined,
      updatedAt: Date.now(),
    });
  }
  await scheduleReadyProjectTasks(ctx, projectId);
}

/**
 * The coordinator adds a handed Triage item to an open task of the same
 * project (`merge_task_into`): the item is cancelled and remembers the task
 * it went to ("Added to #N"). The coordinator gives the target task the item
 * itself (`send_chat_message`). Refuses a finished, cancelled or merged
 * target, the item itself, and a task of another project.
 */
export async function mergeHandedTask(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  taskId: Id<"agentTasks">,
  intoTaskId: Id<"agentTasks">,
): Promise<Doc<"agentTasks">> {
  const task = await coordinatorTodoTask(ctx, projectId, taskId);
  if (intoTaskId === taskId) {
    throw new Error("A task cannot be merged into itself.");
  }
  const into = await ctx.db.get(intoTaskId);
  if (!into || into.projectId !== projectId || isEntityDeleted(into)) {
    throw new Error("The target task is not part of this project.");
  }
  if (
    into.status === "done" ||
    into.status === "cancelled" ||
    into.prState === "merged" ||
    into.prState === "closed"
  ) {
    throw new Error(
      "The target task is finished. Pick an open task, or start this one with start_task.",
    );
  }
  await ctx.db.patch(task._id, {
    status: "cancelled",
    mergedIntoTaskId: into._id,
    handedToCoordinatorAt: undefined,
    updatedAt: Date.now(),
  });
  await syncOwnedSessionWithTaskStatus(ctx, task, task.status, "cancelled");
  return into;
}

/**
 * The coordinator's one restart of a failed child task (decision 17): only
 * while `coordinatorRetries` is 0, and it sets it to 1. A second failure then
 * waits for a person ("needs you"); a person's restart never uses the count.
 * The retry is a new run in the same task session, on the same branch.
 */
export async function retryFailedTask(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  note: string,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || task.projectId === undefined || isEntityDeleted(task)) {
    throw new Error("Project task not found");
  }
  if ((task.coordinatorRetries ?? 0) >= MAX_COORDINATOR_RETRIES) {
    throw new Error(
      "The coordinator already retried this task once. A person decides now.",
    );
  }
  const project = await ctx.db.get(task.projectId);
  if (!project) throw new Error("Project not found");
  const facts = await projectTaskFacts(
    ctx.db,
    await loadProjectFactsContext(ctx.db, project, Date.now()),
    task,
  );
  if (facts.halted !== "failed") {
    throw new Error("Only a task whose last run failed can be retried");
  }
  await ctx.db.patch(taskId, {
    coordinatorRetries: (task.coordinatorRetries ?? 0) + 1,
  });
  const trimmed = note.trim();
  if (
    !(await startProjectTask(
      ctx,
      task,
      trimmed
        ? `The project coordinator retried this task after its last run failed. Its note:\n${trimmed}`
        : undefined,
    ))
  ) {
    throw new Error("The task did not start. Try again in a moment.");
  }
}
