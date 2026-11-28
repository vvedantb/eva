import type { Infer } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { runModeValidator } from "../validators";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { ensureWorkSession } from "../_sessions/ownedSession";
import { findWorkChat } from "../_sessions/ownerState";
import { closeTaskReports, findOpenAsk } from "../_projects/reports";
import { queueTaskRunMessage } from "../_sessions/execution";
import { taskBranchName } from "../_git/branchNames";
import { buildTaskRunPrompt } from "../_agentTasks/workflowQueries";
import { evaChatSettings, takesEvaSettings } from "../_projects/projectAccount";
import { setTaskLastRunStartedAt } from "./runSummary";
import { hasActiveTaskRun } from "./taskRunStatus";

type TaskRunMode = Infer<typeof runModeValidator>;

async function attachmentsAddedSince(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  previousRunStartedAt: number | undefined,
): Promise<Id<"_storage">[] | undefined> {
  const ids = task.attachmentStorageIds ?? [];
  if (previousRunStartedAt === undefined || ids.length === 0)
    return ids.length > 0 ? ids : undefined;
  const blobs = await Promise.all(
    ids.map((id) => ctx.db.system.get("_storage", id)),
  );
  const added = ids.filter(
    (_id, index) => (blobs[index]?._creationTime ?? 0) > previousRunStartedAt,
  );
  return added.length > 0 ? added : undefined;
}

/** What started a run, as the chat's user row says it. */
export function runChatPrompt(p: {
  task: Pick<Doc<"agentTasks">, "title" | "description">;
  mode: TaskRunMode;
  isFirstRun: boolean;
  comment: string | undefined;
  note: string | undefined;
}): string {
  if (p.mode === "resolve_conflicts") return "Resolve merge conflicts";
  if (p.comment !== undefined) return p.comment;
  if (p.note !== undefined) return p.note;
  if (p.isFirstRun) {
    return p.task.description
      ? `${p.task.title}\n\n${p.task.description}`
      : p.task.title;
  }
  return "Run again";
}

/**
 * Runs a task now: queues its run as a task-mode message in the task's chat.
 * It starts at once on an idle chat, after the running turn otherwise, and a
 * sleeping sandbox wakes for it. The one start for every run: Run, Resolve
 * Conflicts, a schedule firing, an auto-start, the project scheduler, the
 * coordinator's retry and an answer to the task's question. The caller
 * checks access.
 */
export async function startTaskRunTurn(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  p: {
    mode?: TaskRunMode;
    userId: Id<"users"> | undefined;
    commentId?: Id<"taskComments">;
    note?: string;
    displayContent?: string;
    sentViaOrchestrator?: boolean;
  },
): Promise<void> {
  if (await hasActiveTaskRun(ctx.db, task)) {
    throw new Error("Task already has an active execution");
  }
  const repoId = task.repoId;
  if (!repoId) throw new Error("Task has no associated repository");
  const repo = await ctx.db.get(repoId);
  if (!repo) throw new Error("Repository not found");
  const mode = p.mode ?? "implementation";
  const summary = await ctx.db
    .query("agentTaskRunSummaries")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .unique();
  const previousRunStartedAt = summary?.lastRunStartedAt;
  const commentId = p.commentId ?? task.pendingChangeRequestCommentId;
  const comment = commentId
    ? (await ctx.db.get(commentId))?.content
    : undefined;
  const context = await ensureWorkSession(ctx, { kind: "task", task });
  let chat = context.mainChat;
  const project =
    task.projectId !== undefined ? await ctx.db.get(task.projectId) : null;
  if (project && (await takesEvaSettings(ctx.db, task))) {
    const eva = await evaChatSettings(ctx.db, project);
    if (eva?.lastModel !== undefined) {
      await ctx.db.patch(chat._id, {
        lastModel: eva.lastModel,
        providerAccountId: eva.providerAccountId,
      });
      chat = (await ctx.db.get(chat._id)) ?? chat;
    }
  }
  const { prompt } = await buildTaskRunPrompt(ctx, {
    task,
    repo,
    mode,
    branchName: context.session.branchName || taskBranchName(task),
    commentsSince: previousRunStartedAt,
    linkedRepoRows: await ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", context.session._id))
      .collect(),
  });
  const note = p.note?.trim() || undefined;
  const isFirstRun = previousRunStartedAt === undefined;
  const now = Date.now();
  await setTaskLastRunStartedAt(ctx, task._id, repoId, now);
  await ctx.db.patch(task._id, {
    status: "in_progress",
    pendingChangeRequestCommentId: undefined,
    updatedAt: now,
  });
  await queueTaskRunMessage(ctx, {
    context: { session: context.session, chat },
    userId: p.userId ?? task.createdBy,
    content: note ? `${prompt}\n\n${note}` : prompt,
    displayContent:
      p.displayContent ??
      runChatPrompt({ task, mode, isFirstRun, comment, note }),
    taskRun: { mode },
    attachmentStorageIds: await attachmentsAddedSince(
      ctx,
      task,
      previousRunStartedAt,
    ),
    sentViaOrchestrator: p.sentViaOrchestrator,
  });
}

/** Runs a task an automation or evaluation created, unless it already runs. */
export async function autoStartTaskRun(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  userId: Id<"users">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error("Task not found");
  if (await hasActiveTaskRun(ctx.db, task)) return;
  await startTaskRunTurn(ctx, task, { userId });
}

/**
 * Stops a task's run that is not a live turn (the chat Stop closes that one,
 * and its close hook moves the task): a Run still waiting in the queue, or a
 * project task waiting on the answer to its question. The queued Run goes,
 * the question closes, the task is To Do again and its project's scheduler
 * looks again. A no-op when the task has neither. The caller checks access.
 */
export async function stopTaskRun(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<void> {
  const owned = await findWorkChat(ctx.db, { kind: "task", task });
  const queued = owned
    ? (
        await ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_order", (q) =>
            q.eq("parentId", owned.chat._id),
          )
          .collect()
      ).filter((row) => row.taskRun !== undefined)
    : [];
  const ask = await findOpenAsk(ctx.db, task._id);
  if (queued.length === 0 && ask === null) return;
  for (const row of queued) await ctx.db.delete(row._id);
  if (ask) await closeTaskReports(ctx, task._id);
  if (task.status === "in_progress") {
    await ctx.db.patch(task._id, { status: "todo", updatedAt: Date.now() });
  }
  if (task.projectId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.buildWorkflow.scheduleReadyTasks, {
      projectId: task.projectId,
    });
  }
}
