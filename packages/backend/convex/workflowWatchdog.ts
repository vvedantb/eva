import { v } from "convex/values";
import { type MutationCtx, internalMutation } from "./_generated/server";
import { type WorkflowId } from "@convex-dev/workflow";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { cancelTrackedWorkflow } from "./workflowManager";
import { RUN_TIMEOUT_MS } from "./_taskWorkflow/staleness";
import {
  getProjectConversation,
  setProjectConversation,
} from "./_projects/helpers";
import { recomputeProjectPhase } from "./functions";
import {
  PROJECT_CHAT_STREAM_PREFIX,
  TASK_CHAT_STREAM_PREFIX,
  projectChatAdapter,
  sessionChatAdapter,
  taskChatAdapter,
  trackAgentTaskChatWorkflow,
  trackProjectChatWorkflow,
  trackSessionChatWorkflow,
  trackSessionWorkflow,
  type ChatAlert,
} from "./_chat/surfaceAdapters";
import {
  cancelStaleWorkflow,
  finalizeStaleChatTurn,
} from "./_chat/stallWatchdog";
import { buildStaleDocPatch } from "./_prRecapWorkflow/staleDoc";
import { sessionSummaryStreamingEntityId } from "./_chat/agentStreamIds";
import { ensureMainChat } from "./_sessionChats/helpers";

// Re-exported so existing importers (agentTaskChatWorkflow.ts,
// projectChatWorkflow.ts, _queues/helpers.ts, and others — see
// chatSurfaceUnificationContract.test.ts) keep resolving these names from
// "./workflowWatchdog" unchanged; the implementations now live in
// _chat/surfaceAdapters.ts and _taskWorkflow/staleness.ts.
export {
  PROJECT_CHAT_STREAM_PREFIX,
  TASK_CHAT_STREAM_PREFIX,
  RUN_TIMEOUT_MS,
  trackAgentTaskChatWorkflow,
  trackProjectChatWorkflow,
  trackSessionChatWorkflow,
  trackSessionWorkflow,
};

/** Records a workflow as the active workflow for a doc and schedules a stale handler. */
export async function trackDocWorkflow(
  ctx: MutationCtx,
  docId: Id<"docs">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(docId, { activeWorkflowId: id });
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleDoc,
    { docId, workflowId: id },
  );
}

/** Records a workflow as the active workflow for a project and schedules a stale handler. */
export async function trackProjectWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(projectId, { activeWorkflowId: id });
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleProject,
    { projectId, workflowId: id },
  );
}

/** Records a workflow as the active workflow for an evaluation report (guarded against late-arriving errors) and schedules a stale handler. */
export async function trackEvaluationWorkflow(
  ctx: MutationCtx,
  reportId: Id<"evaluationReports">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  const report = await ctx.db.get(reportId);
  if (
    report &&
    report.status !== "error" &&
    report.activeWorkflowId === undefined
  ) {
    await ctx.db.patch(reportId, { activeWorkflowId: id });
  }
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleEvaluation,
    { reportId, workflowId: id },
  );
}

/** Records a workflow as the active build workflow for a project and schedules a stale handler. */
export async function trackProjectBuildWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: WorkflowId,
  options: { clearLastBuildError?: boolean } = {},
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(projectId, {
    activeBuildWorkflowId: id,
    ...(options.clearLastBuildError ? { lastBuildError: undefined } : {}),
  });
  await recomputeProjectPhase(ctx, projectId);
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleBuild,
    { projectId, workflowId: id },
  );
}

/** Tears down a stale session-level workflow (the summary); chats use `handleStaleSessionChat`. */
export const handleStaleSession = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await tearDownStaleSessionWorkflow(
      ctx,
      args.sessionId,
      args.workflowId,
      sessionChatAdapter.alerts.timeout,
    );
    return null;
  },
});

/**
 * Tears down a session-level workflow (the summary — chat turns live on their
 * chat) the 2-hour backstop or the lease reconciler gave up on. No-op once
 * the session tracks another workflow. The alert lands in the Main chat.
 */
export async function tearDownStaleSessionWorkflow(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  workflowId: string,
  alert: ChatAlert,
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session || session.activeWorkflowId !== workflowId) return;
  await cancelStaleWorkflow(ctx, workflowId, [
    sessionSummaryStreamingEntityId(sessionId),
  ]);
  const mainChat = await ensureMainChat(ctx, session);
  await ctx.db.insert("messages", {
    parentId: mainChat._id,
    role: "assistant",
    content: alert.text,
    timestamp: Date.now(),
    isSystemAlert: true,
    ...(alert.detail !== undefined ? { errorDetail: alert.detail } : {}),
  });
  await ctx.db.patch(sessionId, {
    activeWorkflowId: undefined,
    updatedAt: Date.now(),
  });
}

/** Cancels a stale session chat workflow and starts the next queued message. */
export const handleStaleSessionChat = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await sessionChatAdapter.getEntity(ctx, args.chatId);
    if (
      !context ||
      sessionChatAdapter.activeWorkflowId(context) !== args.workflowId
    ) {
      return null;
    }
    await finalizeStaleChatTurn(
      ctx,
      sessionChatAdapter,
      args.chatId,
      context,
      args.workflowId,
      sessionChatAdapter.alerts.timeout,
    );
    return null;
  },
});



/** Cancels a stale evaluation workflow and marks it as timed out or fix error. */
export const handleStaleEvaluation = internalMutation({
  args: {
    reportId: v.id("evaluationReports"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await tearDownStaleEvaluationWorkflow(ctx, args.reportId, args.workflowId);
    return null;
  },
});

/** Cancels a stale evaluation or fix workflow and marks the report failed. */
export async function tearDownStaleEvaluationWorkflow(
  ctx: MutationCtx,
  reportId: Id<"evaluationReports">,
  workflowId: string,
): Promise<void> {
  const report = await ctx.db.get(reportId);
  if (!report || report.activeWorkflowId !== workflowId) return;

  await cancelStaleWorkflow(ctx, workflowId, [String(reportId)]);

  if (report.status === "completed" && report.fixStatus === "fixing") {
    await ctx.db.patch(reportId, {
      fixStatus: "fix_error",
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.patch(reportId, {
      status: "error",
      error: "Evaluation timed out",
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });
  }
}

/** Cancels a stale doc workflow and updates interview history with an error marker. */
export const handleStaleDoc = internalMutation({
  args: {
    docId: v.id("docs"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await tearDownStaleDocWorkflow(ctx, args.docId, args.workflowId);
    return null;
  },
});

/** Cancels a stale doc workflow (PR recap, doc interview, test generation) and marks the doc failed. */
export async function tearDownStaleDocWorkflow(
  ctx: MutationCtx,
  docId: Id<"docs">,
  workflowId: string,
): Promise<void> {
  const doc = await ctx.db.get(docId);
  if (!doc || doc.activeWorkflowId !== workflowId) return;

  await cancelStaleWorkflow(ctx, workflowId, [String(docId)]);

  await ctx.db.patch(docId, buildStaleDocPatch(doc, Date.now()));
}

/** Cancels a stale project workflow and marks the last message as timed out. */
export const handleStaleProject = internalMutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await tearDownStaleProjectWorkflow(ctx, args.projectId, args.workflowId);
    return null;
  },
});

/** Cancels a stale project interview or spec workflow and marks the last message failed. */
export async function tearDownStaleProjectWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string,
): Promise<void> {
  const project = await ctx.db.get(projectId);
  if (!project || project.activeWorkflowId !== workflowId) return;

  await cancelStaleWorkflow(ctx, workflowId, [String(projectId)]);

  const conversation = await getProjectConversation(ctx.db, projectId);
  const messages = [...conversation];
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && !last.content) {
    last.content = JSON.stringify({ error: true });
  }

  await setProjectConversation(ctx.db, projectId, messages);
  await ctx.db.patch(projectId, {
    activeWorkflowId: undefined,
    lastSandboxActivity: Date.now(),
  });
}

/** Cancels a stale project chat workflow via the 2-hour workflow-timeout backstop. */
export const handleStaleProjectChat = internalMutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await projectChatAdapter.getEntity(ctx, args.projectId);
    if (
      !project ||
      projectChatAdapter.activeWorkflowId(project) !== args.workflowId
    )
      return null;

    await finalizeStaleChatTurn(
      ctx,
      projectChatAdapter,
      args.projectId,
      project,
      args.workflowId,
      projectChatAdapter.alerts.timeout,
    );

    return null;
  },
});



/** Cancels a stale task chat workflow via the 2-hour workflow-timeout backstop. */
export const handleStaleAgentTaskChat = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await taskChatAdapter.getEntity(ctx, args.taskId);
    if (!task || taskChatAdapter.activeWorkflowId(task) !== args.workflowId)
      return null;

    await finalizeStaleChatTurn(
      ctx,
      taskChatAdapter,
      args.taskId,
      task,
      args.workflowId,
      taskChatAdapter.alerts.timeout,
    );

    return null;
  },
});



/** Cancels a stale build workflow and clears the active build reference. */
export const handleStaleBuild = internalMutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.activeBuildWorkflowId !== args.workflowId)
      return null;

    await cancelTrackedWorkflow(ctx, args.workflowId);

    await ctx.db.patch(args.projectId, {
      activeBuildWorkflowId: undefined,
    });
    await recomputeProjectPhase(ctx, args.projectId);

    return null;
  },
});
