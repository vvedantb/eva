import type { ObjectType } from "convex/values";
import type { WorkflowId } from "@convex-dev/workflow";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { workflow } from "../workflowManager";
import { normalizeAIModel } from "../validators";
import { bindTurnWorkflow, closeOpenTurn, openTurn } from "../_chat/turnStore";
import { getTaskRunStreamingEntityId } from "./helpers";
import { resolveCredentialSourceLabel } from "../_userProviderAccounts/credentialSource";
import { setTaskLastRunStartedAt } from "../_agentTasks/runSummary";
import { markTaskRunStarted } from "../_agentTasks/runState";
import type { taskExecutionWorkflowArgs } from "./workflowDefinition";
import {
  ensureOwnedSession,
  taskSessionBusy,
  taskUsesOwnedSession,
} from "../_sessions/ownedSession";
import { TASK_CHAT_BUSY_ERROR } from "./recovery";

/**
 * The one way to start a quick-task or project-task run. Queues an
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
    branchName?: string;
    projectId?: Id<"projects">;
    mode?: Doc<"agentRuns">["mode"];
    triggeredBy?: Id<"users">;
    triggeringCommentId?: Id<"taskComments">;
    clearPendingChangeRequest: boolean;
    rollbackStatus: Doc<"agentTasks">["status"];
  },
): Promise<Id<"agentRuns">> {
  const { task, repo } = p;
  // One agent per sandbox: a run waits while the task's session chat is
  // mid-reply, as a chat message waits behind a run.
  if (taskUsesOwnedSession(task) && (await taskSessionBusy(ctx.db, task._id))) {
    throw new Error(TASK_CHAT_BUSY_ERROR);
  }
  const startedAt = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    taskId: task._id,
    status: "queued",
    logs: [],
    startedAt,
    mode: p.mode,
    triggeredBy: p.triggeredBy,
    triggeringCommentId: p.triggeringCommentId,
    credentialSourceLabel: await resolveCredentialSourceLabel(
      ctx.db,
      task.providerAccountId,
      task.createdBy,
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
  // A quick task runs on its session's sandbox; project tasks keep the
  // project's. Looked up (or created) here so the run's turn and sandbox
  // writes land on that one session.
  const ownedSession =
    taskUsesOwnedSession(task)
      ? (await ensureOwnedSession(ctx, task)).session
      : null;
  try {
    await startTaskRunWorkflow(ctx, {
      runId,
      taskId: task._id,
      repoId: repo._id,
      installationId: repo.installationId,
      projectId: p.projectId,
      ownedSessionId: ownedSession?._id,
      branchName: p.branchName,
      baseBranch: p.baseBranch,
      isFirstTaskOnBranch: p.isFirstTaskOnBranch,
      model: task.model ?? repo.defaultModel,
      providerAccountId: task.providerAccountId,
      credentialOwnerUserId: task.createdBy,
      userId: p.userId,
      mode: p.mode,
    });
  } catch (error) {
    await ctx.db.patch(runId, {
      status: "error",
      error:
        error instanceof Error ? error.message : "Failed to start workflow",
      finishedAt: Date.now(),
      exitReason: "workflow_start_failed",
    });
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
 * A quick task's run turn is filed under its session (`sessionId`): the
 * session's chats then see it as their busy gate, so a chat message sent
 * mid-run queues behind the run (`sessionChatHasFreeSlot`), and the run's
 * end drains that queue (`closeTurn`). The turn stays keyed on the run, so
 * completion, cancel and the watchdog are unchanged.
 */
async function startTaskRunWorkflow(
  ctx: MutationCtx,
  args: ObjectType<typeof taskExecutionWorkflowArgs>,
): Promise<WorkflowId> {
  const task = await ctx.db.get(args.taskId);
  const turnId = await openTurn(ctx, {
    entityId: args.runId,
    sessionId: args.ownedSessionId,
    streamingEntityId: getTaskRunStreamingEntityId(args.runId),
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
