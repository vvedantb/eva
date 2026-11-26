import type { ObjectType } from "convex/values";
import type { WorkflowId } from "@convex-dev/workflow";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { workflow } from "../workflowManager";
import { normalizeAIModel } from "../validators";
import { bindTurnWorkflow, closeOpenTurn, openTurn } from "../_chat/turnStore";
import { openRunChatTurn, settleRunChatTurn } from "./runChatTurn";
import { resolveCredentialSourceLabel } from "../_userProviderAccounts/credentialSource";
import { setTaskLastRunStartedAt } from "../_agentTasks/runSummary";
import { markTaskRunStarted } from "../_agentTasks/runState";
import type { taskExecutionWorkflowArgs } from "./workflowDefinition";
import { ensureWorkSession, ownedSessionBusy } from "../_sessions/ownedSession";
import { TASK_CHAT_BUSY_ERROR } from "./recovery";
import {
  accountHolder,
  latestTaskRun,
  projectRunSettings,
  takesProjectSettings,
} from "../_projects/runSettings";

/**
 * True while the task's own session holds its sandbox for a chat turn, a run
 * or a start/stop. A run waits then, as a chat message waits behind a run.
 */
export async function taskWorkSessionBusy(
  db: MutationCtx["db"],
  task: Pick<Doc<"agentTasks">, "_id">,
): Promise<boolean> {
  return await ownedSessionBusy(db, { kind: "task", taskId: task._id });
}

/**
 * A project's child task runs on the project's model and account, copied
 * when the task starts (`takesProjectSettings`, decision 20). Returns the
 * task as the run sees it, and whose personal account the run may unlock
 * (`accountHolder`): the project owner for the project's account, else the
 * person who created the task.
 */
async function adoptProjectRunSettings(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<{ task: Doc<"agentTasks">; credentialOwnerUserId: Id<"users"> }> {
  const project = task.projectId ? await ctx.db.get(task.projectId) : null;
  if (!project) return { task, credentialOwnerUserId: task.createdBy };
  let adopted = task;
  if (takesProjectSettings(await latestTaskRun(ctx.db, task._id))) {
    const settings = projectRunSettings(project, task);
    await ctx.db.patch(task._id, settings);
    adopted = { ...task, ...settings };
  }
  return {
    task: adopted,
    credentialOwnerUserId: accountHolder(
      project,
      adopted.providerAccountId,
      task.createdBy,
    ),
  };
}

/**
 * The one way to start a project task's run (on its own session, branch and
 * PR; a quick task runs in its chat, `_agentTasks/taskRunTurn.ts`). Queues an
 * `agentRuns` row, stamps the task's run summary, moves the task to
 * `in_progress` and starts `taskExecutionWorkflow`. A failed start marks the
 * run `workflow_start_failed`, rolls the task back to `rollbackStatus` and
 * rethrows. The rollback persists only when the caller catches, because a
 * rethrow reverts the whole mutation.
 */
export async function startTaskRun(
  ctx: MutationCtx,
  p: {
    task: Doc<"agentTasks">;
    repo: Doc<"githubRepos">;
    userId: Id<"users">;
    baseBranch: string;
    isFirstTaskOnBranch: boolean;
    mode?: Doc<"agentRuns">["mode"];
    triggeredBy?: Id<"users">;
    triggeringCommentId?: Id<"taskComments">;
    clearPendingChangeRequest: boolean;
    rollbackStatus: Doc<"agentTasks">["status"];
    /** Extra text for the run's prompt (`agentRuns.note`). */
    note?: string;
  },
): Promise<Id<"agentRuns">> {
  const { repo } = p;
  if (p.task.projectId === undefined) {
    throw new Error("A quick task runs in its chat (startQuickTaskRun)");
  }
  // One agent per sandbox: a run waits while its session's chat is mid-reply,
  // as a chat message waits behind a run.
  if (await taskWorkSessionBusy(ctx.db, p.task)) {
    throw new Error(TASK_CHAT_BUSY_ERROR);
  }
  const { task, credentialOwnerUserId } = await adoptProjectRunSettings(
    ctx,
    p.task,
  );
  const isFirstRun =
    (await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .first()) === null;
  const startedAt = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    taskId: task._id,
    status: "queued",
    logs: [],
    startedAt,
    mode: p.mode,
    triggeredBy: p.triggeredBy,
    triggeringCommentId: p.triggeringCommentId,
    ...(p.note !== undefined ? { note: p.note } : {}),
    credentialSourceLabel: await resolveCredentialSourceLabel(
      ctx.db,
      task.providerAccountId,
      credentialOwnerUserId,
    ),
    model: normalizeAIModel(task.model),
  });
  await setTaskLastRunStartedAt(ctx, task._id, repo._id, startedAt);
  await ctx.db.patch(task._id, {
    status: "in_progress",
    updatedAt: Date.now(),
    ...(p.clearPendingChangeRequest
      ? { pendingChangeRequestCommentId: undefined }
      : {}),
  });
  // A task runs on its own session's sandbox. Looked up (or created) here so
  // the run's turn and sandbox writes land on that one session, and its
  // prompt and reply land in that session's Main chat.
  const { session: ownedSession, mainChat } = await ensureWorkSession(ctx, {
    kind: "task",
    task,
  });
  const run = await ctx.db.get(runId);
  if (!run) throw new Error("Run was not created");
  const streamingEntityId = await openRunChatTurn(ctx, {
    run,
    task,
    chat: mainChat,
    userId: p.triggeredBy,
    isFirstRun,
  });
  try {
    await startTaskRunWorkflow(ctx, {
      runId,
      taskId: task._id,
      repoId: repo._id,
      // The task's own repo's GitHub App installation, never a project's.
      installationId: repo.installationId,
      projectId: task.projectId,
      ownedSessionId: ownedSession._id,
      baseBranch: p.baseBranch,
      isFirstTaskOnBranch: p.isFirstTaskOnBranch,
      model: task.model ?? repo.defaultModel,
      providerAccountId: task.providerAccountId,
      credentialOwnerUserId,
      userId: p.userId,
      mode: p.mode,
    }, streamingEntityId);
  } catch (error) {
    await ctx.db.patch(runId, {
      status: "error",
      error:
        error instanceof Error ? error.message : "Failed to start workflow",
      finishedAt: Date.now(),
      exitReason: "workflow_start_failed",
    });
    await settleRunChatTurn(ctx, task._id, runId);
    await ctx.db.patch(task._id, {
      status: p.rollbackStatus,
      updatedAt: Date.now(),
    });
    throw error;
  }
  return runId;
}

/**
 * Opens the run's durable turn (its startup lease covers sandbox
 * preparation), starts `taskExecutionWorkflow` with it, binds the turn and
 * records the workflow on the task. A failed start closes the turn and
 * rethrows, so `startTaskRun` can roll back.
 *
 * A task's run turn is filed under its session (`sessionId`): the
 * session's chats then see it as their busy gate, so a chat message sent
 * mid-run queues behind the run (`sessionChatHasFreeSlot`), and the run's
 * end drains that queue (`closeTurn`). The turn stays keyed on the run, so
 * completion, cancel and the watchdog are unchanged.
 */
async function startTaskRunWorkflow(
  ctx: MutationCtx,
  args: ObjectType<typeof taskExecutionWorkflowArgs>,
  streamingEntityId: string,
): Promise<WorkflowId> {
  const task = await ctx.db.get(args.taskId);
  const run = await ctx.db.get(args.runId);
  const turnId = await openTurn(ctx, {
    entityId: args.runId,
    sessionId: args.ownedSessionId,
    streamingEntityId,
    placeholderMessageId: run?.replyMessageId,
    model: normalizeAIModel(args.model ?? task?.model),
    repoId: args.repoId,
  });
  let workflowId: WorkflowId;
  try {
    workflowId = await workflow.start(
      ctx,
      internal.taskWorkflow.taskExecutionWorkflow,
      { ...args, turnId },
    );
  } catch (error) {
    await closeOpenTurn(ctx, args.runId, "error", {
      error: "Run workflow failed to start",
    });
    throw error;
  }
  await bindTurnWorkflow(ctx, turnId, String(workflowId));
  await markTaskRunStarted(ctx, args.taskId, {
    workflowId: String(workflowId),
    runId: args.runId,
  });
  return workflowId;
}
