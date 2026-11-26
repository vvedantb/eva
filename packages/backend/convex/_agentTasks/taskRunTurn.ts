import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureWorkSession } from "../_sessions/ownedSession";
import { queueTaskRunMessage } from "../_sessions/execution";
import { taskBranchName } from "../_git/branchNames";
import { runChatPrompt } from "../_taskWorkflow/runChatTurn";
import { buildTaskRunPrompt } from "../_taskWorkflow/queries";
import { setTaskLastRunStartedAt } from "./runSummary";
import { hasActiveQuickTaskRun } from "./taskRunStatus";

/**
 * A quick task's run is a turn in its own session's Main chat, carried by the
 * session chat workflow like any message. It is marked `taskRun` from the
 * queue to the turn; that marker is what moves the task card: `in_progress`
 * when the run is asked for, then Review or To Do when its turn closes. A
 * plain chat message in the same chat never changes the status. Project
 * tasks still run on `agentRuns` (`_taskWorkflow/startRun.ts`).
 */

type TaskRunMode = NonNullable<Doc<"agentRuns">["mode"]>;

/**
 * Runs a quick task now: queues its run as a task-mode message in the task's
 * chat. It starts at once on an idle chat, after the running turn otherwise,
 * and a sleeping sandbox wakes for it. The one start for quick tasks: Run,
 * Resolve Conflicts, a schedule firing and an auto-start. The caller checks
 * access.
 */
export async function startQuickTaskRun(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  p: {
    mode?: TaskRunMode;
    userId: Id<"users"> | undefined;
    /** A change request to act on; else the one parked on the task. */
    commentId?: Id<"taskComments">;
  },
): Promise<void> {
  if (task.projectId !== undefined) {
    throw new Error("A project task runs through its project");
  }
  if (await hasActiveQuickTaskRun(ctx.db, task)) {
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
  // Comments after the previous run's start are new to the agent.
  const previousRunStartedAt = summary?.lastRunStartedAt;
  const commentId = p.commentId ?? task.pendingChangeRequestCommentId;
  const comment = commentId
    ? (await ctx.db.get(commentId))?.content
    : undefined;
  const context = await ensureWorkSession(ctx, { kind: "task", task });
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
  const isFirstRun = previousRunStartedAt === undefined;
  const now = Date.now();
  await setTaskLastRunStartedAt(ctx, task._id, repoId, now);
  await ctx.db.patch(task._id, {
    status: "in_progress",
    pendingChangeRequestCommentId: undefined,
    updatedAt: now,
  });
  await queueTaskRunMessage(ctx, {
    context: { session: context.session, chat: context.mainChat },
    userId: p.userId ?? task.createdBy,
    content: prompt,
    displayContent: runChatPrompt({
      task,
      mode,
      isFirstRun,
      comment,
      note: undefined,
    }),
    taskRun: { mode },
    attachmentStorageIds: isFirstRun ? task.attachmentStorageIds : undefined,
  });
}

/** Runs a task an automation or evaluation created, unless it already runs. */
export async function autoStartQuickTask(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  userId: Id<"users">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error("Task not found");
  if (await hasActiveQuickTaskRun(ctx.db, task)) return;
  await startQuickTaskRun(ctx, task, { userId });
}
