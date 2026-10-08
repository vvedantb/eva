import { v } from "convex/values";
import {
  type MutationCtx,
  internalAction,
  internalMutation,
} from "./_generated/server";
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
  trackSessionWorkflow,
} from "./_chat/surfaceAdapters";
import {
  cancelStaleWorkflow,
  finalizeStaleChatTurn,
  runStaleChatHeartbeatCheck,
  runStaleChatLivenessProbe,
} from "./_chat/stallWatchdog";
import { buildStaleDocPatch } from "./_prRecapWorkflow/staleDoc";

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

/** Cancels a stale chat session workflow and starts the next queued message. */
export const handleStaleSession = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await sessionChatAdapter.getEntity(ctx, args.chatId);
    if (!chat || sessionChatAdapter.activeWorkflowId(chat) !== args.workflowId)
      return null;

    await finalizeStaleChatTurn(
      ctx,
      sessionChatAdapter,
      args.chatId,
      chat,
      args.workflowId,
      sessionChatAdapter.alerts.timeout,
    );

    return null;
  },
});

/**
 * Recurring no-heartbeat check for one session turn. Armed by
 * trackSessionWorkflow, re-schedules itself every STALE_RECHECK_MS while the
 * tracked workflow is still the session's active one, and ends with the turn.
 * See runStaleChatHeartbeatCheck (_chat/stallWatchdog.ts) for the full
 * rationale — shared by all three chat surfaces.
 */
export const checkStaleSessionHeartbeat = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    workflowId: v.string(),
    turnStartedAt: v.number(),
    // Set by the liveness probe once it has confirmed the sandbox/callback is
    // dead, so the kill proceeds without another probe round-trip.
    skipLivenessProbe: v.optional(v.boolean()),
    // Set by the probe when the sandbox VM itself is no longer running (e.g.
    // it hit the provider's runtime limit) — the failure message names the
    // stopped sandbox and the session is closed instead of left "active".
    sandboxStopped: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runStaleChatHeartbeatCheck(ctx, sessionChatAdapter, {
      id: args.chatId,
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
      skipLivenessProbe: args.skipLivenessProbe,
      sandboxStopped: args.sandboxStopped,
    });
    return null;
  },
});

/**
 * Pre-kill liveness gate for a stale session turn. See
 * runStaleChatLivenessProbe (_chat/stallWatchdog.ts) for the full rationale —
 * shared by all three chat surfaces.
 */
export const probeStaleSessionLiveness = internalAction({
  args: {
    chatId: v.id("sessionChats"),
    workflowId: v.string(),
    turnStartedAt: v.number(),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    streamingAgeMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runStaleChatLivenessProbe(ctx, sessionChatAdapter, {
      id: args.chatId,
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
      sandboxId: args.sandboxId,
      repoId: args.repoId,
      streamingAgeMs: args.streamingAgeMs,
    });
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
    const report = await ctx.db.get(args.reportId);
    if (!report || report.activeWorkflowId !== args.workflowId) return null;

    await cancelStaleWorkflow(ctx, args.workflowId, [String(args.reportId)]);

    if (report.status === "completed" && report.fixStatus === "fixing") {
      await ctx.db.patch(args.reportId, {
        fixStatus: "fix_error",
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.reportId, {
        status: "error",
        error: "Evaluation timed out",
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

/** Cancels a stale doc workflow and updates interview history with an error marker. */
export const handleStaleDoc = internalMutation({
  args: {
    docId: v.id("docs"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.activeWorkflowId !== args.workflowId) return null;

    await cancelStaleWorkflow(ctx, args.workflowId, [String(args.docId)]);

    await ctx.db.patch(args.docId, buildStaleDocPatch(doc, Date.now()));

    return null;
  },
});

/** Cancels a stale project workflow and marks the last message as timed out. */
export const handleStaleProject = internalMutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.activeWorkflowId !== args.workflowId) return null;

    await cancelStaleWorkflow(ctx, args.workflowId, [String(args.projectId)]);

    const conversation = await getProjectConversation(ctx.db, args.projectId);
    const messages = [...conversation];
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant" && !last.content) {
      last.content = JSON.stringify({ error: true });
    }

    await setProjectConversation(ctx.db, args.projectId, messages);
    await ctx.db.patch(args.projectId, {
      activeWorkflowId: undefined,
      lastSandboxActivity: Date.now(),
    });

    return null;
  },
});

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

/**
 * Recurring no-heartbeat check for one project chat turn. Same shape as
 * checkStaleSessionHeartbeat — see runStaleChatHeartbeatCheck
 * (_chat/stallWatchdog.ts) for the full rationale.
 */
export const checkStaleProjectChatHeartbeat = internalMutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
    turnStartedAt: v.number(),
    skipLivenessProbe: v.optional(v.boolean()),
    sandboxStopped: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runStaleChatHeartbeatCheck(ctx, projectChatAdapter, {
      id: args.projectId,
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
      skipLivenessProbe: args.skipLivenessProbe,
      sandboxStopped: args.sandboxStopped,
    });
    return null;
  },
});

/**
 * Pre-kill liveness gate for a stale project chat turn. Same shape as
 * probeStaleSessionLiveness — see runStaleChatLivenessProbe
 * (_chat/stallWatchdog.ts) for the full rationale.
 */
export const probeStaleProjectChatLiveness = internalAction({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
    turnStartedAt: v.number(),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    streamingAgeMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runStaleChatLivenessProbe(ctx, projectChatAdapter, {
      id: args.projectId,
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
      sandboxId: args.sandboxId,
      repoId: args.repoId,
      streamingAgeMs: args.streamingAgeMs,
    });
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

/**
 * Recurring no-heartbeat check for one task chat turn. Same shape as
 * checkStaleSessionHeartbeat — see runStaleChatHeartbeatCheck
 * (_chat/stallWatchdog.ts) for the full rationale.
 */
export const checkStaleAgentTaskChatHeartbeat = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    workflowId: v.string(),
    turnStartedAt: v.number(),
    skipLivenessProbe: v.optional(v.boolean()),
    sandboxStopped: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runStaleChatHeartbeatCheck(ctx, taskChatAdapter, {
      id: args.taskId,
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
      skipLivenessProbe: args.skipLivenessProbe,
      sandboxStopped: args.sandboxStopped,
    });
    return null;
  },
});

/**
 * Pre-kill liveness gate for a stale task chat turn. Same shape as
 * probeStaleSessionLiveness — see runStaleChatLivenessProbe
 * (_chat/stallWatchdog.ts) for the full rationale.
 */
export const probeStaleAgentTaskChatLiveness = internalAction({
  args: {
    taskId: v.id("agentTasks"),
    workflowId: v.string(),
    turnStartedAt: v.number(),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    streamingAgeMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runStaleChatLivenessProbe(ctx, taskChatAdapter, {
      id: args.taskId,
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
      sandboxId: args.sandboxId,
      repoId: args.repoId,
      streamingAgeMs: args.streamingAgeMs,
    });
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
