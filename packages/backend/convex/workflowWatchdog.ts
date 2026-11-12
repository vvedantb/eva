import { v } from "convex/values";
import { type MutationCtx, internalMutation } from "./_generated/server";
import { type WorkflowId } from "@convex-dev/workflow";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  cancelTrackedWorkflow,
  isTrackedWorkflowRunning,
} from "./workflowManager";
import { RUN_TIMEOUT_MS } from "./_taskWorkflow/staleness";
import { scheduleArenaCheckCompletion } from "./_arena/browserRun";
import {
  getProjectConversation,
  setProjectConversation,
} from "./_projects/helpers";
import { recomputeProjectPhase } from "./functions";
import {
  finishProjectBuild,
  markProjectBuildStarted,
} from "./_projects/buildState";
import {
  finishProjectInterview,
  interviewTurnEntityIds,
  markProjectInterviewStarted,
} from "./_projects/interviewState";
import { closeOpenTurn } from "./_chat/turnStore";
import type { TerminalTurnState } from "./_chat/turnLease";
import { findProjectSession } from "./_sessions/owner";
import { abandonTaskRunSandbox } from "./_sessions/sandbox";
import {
  sessionChatAdapter,
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

// Re-exported so importers keep resolving these names from
// "./workflowWatchdog"; the implementations live in
// _chat/surfaceAdapters.ts and _taskWorkflow/staleness.ts.
export { RUN_TIMEOUT_MS, trackSessionChatWorkflow, trackSessionWorkflow };

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

/**
 * Records an interview or spec workflow as the project's interview
 * (`markProjectInterviewStarted`) and schedules a stale handler.
 */
export async function trackProjectInterviewWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await markProjectInterviewStarted(ctx, projectId, id);
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
  await markProjectBuildStarted(ctx, projectId, id);
  if (options.clearLastBuildError) {
    await ctx.db.patch(projectId, { lastBuildError: undefined });
  }
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
 * chat) the `TURN_BACKSTOP_MS` backstop or the lease reconciler gave up on.
 * No-op once that workflow has ended. The alert lands in the Main chat.
 */
export async function tearDownStaleSessionWorkflow(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  workflowId: string,
  alert: ChatAlert,
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session || !(await isTrackedWorkflowRunning(ctx, workflowId))) return;
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
  await ctx.db.patch(sessionId, { updatedAt: Date.now() });
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
      (await sessionChatAdapter.activeWorkflowId(context, ctx)) !==
        args.workflowId
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
    await scheduleArenaCheckCompletion(ctx, report);
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
    await stopProjectInterview(ctx, args.projectId, args.workflowId, {
      state: "error",
      error: "Project interview timed out",
    });
    return null;
  },
});

/**
 * Stops a project's interview or spec workflow (stale, stalled, or its
 * project closed). With a `workflowId`, a newer interview is left alone.
 * The one teardown for every stop: the state goes idle, the workflow is
 * cancelled, its agent turn closes with `turn`, the session start it claimed
 * fails or the VM it prepared stops (`abandonTaskRunSandbox`; a VM the
 * session already had stays), and an empty assistant bubble reads failed.
 */
export async function stopProjectInterview(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string | undefined,
  turn: { state: TerminalTurnState; error: string },
): Promise<void> {
  const finished = await finishProjectInterview(ctx, projectId, workflowId);
  const previous = finished.previous;
  if (!finished.ok || previous === undefined) return;

  await cancelStaleWorkflow(ctx, previous.workflowId, [String(projectId)]);
  for (const entityId of await interviewTurnEntityIds(ctx.db, projectId)) {
    await closeOpenTurn(ctx, entityId, turn.state, {
      lane: "interview",
      error: turn.error,
    });
  }
  const session = await findProjectSession(ctx.db, projectId);
  if (session && previous.state !== "started") {
    await abandonTaskRunSandbox(ctx, session._id, previous);
  }

  const conversation = await getProjectConversation(ctx.db, projectId);
  const last = conversation.at(-1);
  if (last && last.role === "assistant" && !last.content) {
    await setProjectConversation(ctx.db, projectId, [
      ...conversation.slice(0, -1),
      { ...last, content: JSON.stringify({ error: true }) },
    ]);
  }
}

/** Cancels a stale build workflow and clears the active build reference. */
export const handleStaleBuild = internalMutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finished = await finishProjectBuild(
      ctx,
      args.projectId,
      args.workflowId,
    );
    if (!finished.ok) return null;

    await cancelTrackedWorkflow(ctx, args.workflowId);
    await recomputeProjectPhase(ctx, args.projectId);

    return null;
  },
});
