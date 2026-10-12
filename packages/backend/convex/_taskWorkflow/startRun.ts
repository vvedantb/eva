import type { ObjectType } from "convex/values";
import type { WorkflowId } from "@convex-dev/workflow";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { workflow } from "../workflowManager";
import { normalizeAIModel } from "../validators";
import { bindTurnWorkflow, closeOpenTurn, openTurn } from "../_chat/turnStore";
import { getTaskRunStreamingEntityId } from "./helpers";
import type { taskExecutionWorkflowArgs } from "./workflowDefinition";

/**
 * The one way to start a quick-task or project-task run. Opens the run's
 * durable turn (its startup lease covers sandbox preparation), starts
 * `taskExecutionWorkflow` with it, binds the turn and records the workflow on
 * the task. A failed start closes the turn and rethrows, so each caller keeps
 * its own rollback.
 */
export async function startTaskRunWorkflow(
  ctx: MutationCtx,
  args: ObjectType<typeof taskExecutionWorkflowArgs>,
): Promise<WorkflowId> {
  const task = await ctx.db.get(args.taskId);
  const turnId = await openTurn(ctx, {
    entityId: args.runId,
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
  await ctx.db.patch(args.taskId, { activeWorkflowId: String(workflowId) });
  return workflowId;
}
