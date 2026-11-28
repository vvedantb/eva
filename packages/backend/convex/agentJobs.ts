import { v } from "convex/values";
import { TURN_BACKSTOP_ERROR } from "@eva/shared/agentTurnLimits";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { authMutation, hasRepoAccess } from "./functions";
import { completionCallbackArgs, turnLeaseFenceArgs } from "./validators";
import { toWorkflowId, workflow } from "./workflowManager";
import { settleAgentTurnCompletion } from "./_chat/turnStore";
import { clearStreamingActivity } from "./streaming";
import { resolveAutomationDoc } from "./_automations/systemAutomations";
import {
  agentJobCompleteEvent,
  recordCompletionLog,
} from "./_agentJobs/completion";
import {
  agentJobOwner,
  agentJobOwnerIdValidator,
  type AgentJobOwner,
} from "./_agentJobs/owner";
import { tearDownStaleAgentJob } from "./_agentJobs/slot";

async function jobLogTitle(
  ctx: MutationCtx,
  owner: AgentJobOwner,
): Promise<string> {
  switch (owner.kind) {
    case "doc":
      return (await ctx.db.get(owner.id))?.title ?? "Document";
    case "evaluation":
      return "Evaluation Report";
    case "automation": {
      const run = await ctx.db.get(owner.id);
      const automation = run ? await ctx.db.get(run.automationId) : null;
      return automation ? resolveAutomationDoc(automation).title : "Automation";
    }
  }
}

/**
 * The one completion every one-shot agent posts (`runOneShotAgent`), called
 * by the sandbox via the Convex HTTP API (Clerk JWT). A completion without
 * the current turn lease is dropped. The event goes to the workflow bound to
 * the turn, so a late reply never reaches a newer job on the same owner.
 */
export const handleCompletion = authMutation({
  args: {
    entityId: agentJobOwnerIdValidator,
    runId: v.optional(v.string()),
    ...completionCallbackArgs,
    ...turnLeaseFenceArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = agentJobOwner(ctx.db, args.entityId);
    const row = await ctx.db.get(args.entityId);
    if (!owner || !row) return null;
    if (!(await hasRepoAccess(ctx.db, row.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const turn = await settleAgentTurnCompletion(ctx, {
      entityId: args.entityId,
      turnId: args.turnId,
      leaseGeneration: args.leaseGeneration,
      success: args.success,
      error: args.error,
    });
    if (!turn || turn.workflowId === undefined) return null;

    await clearStreamingActivity(ctx, turn.streamingEntityId);
    await workflow.sendEvent(ctx, {
      ...agentJobCompleteEvent,
      workflowId: toWorkflowId(turn.workflowId),
      value: {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
      },
    });
    await recordCompletionLog(ctx, {
      entityType: owner.kind,
      entityId: String(args.entityId),
      entityTitle: await jobLogTitle(ctx, owner),
      repoId: row.repoId,
      rawResultEvent: args.rawResultEvent,
    });
    return null;
  },
});

/** The `TURN_BACKSTOP_MS` backstop `startAgentJob` schedules for every job. */
export const handleStale = internalMutation({
  args: {
    ownerId: agentJobOwnerIdValidator,
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = agentJobOwner(ctx.db, args.ownerId);
    if (!owner) return null;
    await tearDownStaleAgentJob(
      ctx,
      owner,
      args.workflowId,
      TURN_BACKSTOP_ERROR,
    );
    return null;
  },
});

/** Clears a job's streaming row once its workflow is done with it. */
export const clearStreaming = internalMutation({
  args: { streamingEntityId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, args.streamingEntityId);
    return null;
  },
});
