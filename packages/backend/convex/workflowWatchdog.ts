import { v } from "convex/values";
import { type MutationCtx, internalMutation } from "./_generated/server";
import { type WorkflowId } from "@convex-dev/workflow";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { RUN_TIMEOUT_MS } from "./_taskWorkflow/staleness";
import { scheduleArenaCheckCompletion } from "./_arena/browserRun";
import {
  sessionChatAdapter,
  trackSessionChatWorkflow,
} from "./_chat/surfaceAdapters";
import {
  cancelStaleWorkflow,
  finalizeStaleChatTurn,
} from "./_chat/stallWatchdog";
import { buildStaleDocPatch } from "./_prRecapWorkflow/staleDoc";

// Re-exported so importers keep resolving these names from
// "./workflowWatchdog"; the implementations live in
// _chat/surfaceAdapters.ts and _taskWorkflow/staleness.ts.
export { RUN_TIMEOUT_MS, trackSessionChatWorkflow };

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
