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
 * The one way to start a task run (a quick task or a project's child task,
 * each on its own session, branch and PR). Queues an
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
    note?: string;
  },
): Promise<Id<"agentRuns">> {
  const { repo } = p;
  if (await taskWorkSessionBusy(ctx.db, p.task)) {
    throw new Error(TASK_CHAT_BUSY_ERROR);
  }
  const { task, credentialOwnerUserId } = await adoptProjectRunSettings(
    ctx,
    p.task,
  );
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
  const ownedSession = (await ensureWorkSession(ctx, { kind: "task", task }))
    .session;
  try {
    await startTaskRunWorkflow(ctx, {
      runId,
      taskId: task._id,
      repoId: repo._id,
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
