import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { cancelTrackedWorkflow } from "../workflowManager";
import { finalizeCancelledAssistantMessage } from "../streaming";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { finalizeOpenSyntheticTurnOnCancel } from "./chatResult";
import {
  closeOpenTurn,
  closeTurnForWorkflow,
  type ChatTurnEntityId,
} from "./turnStore";

const CANCELLED_BY_USER = "Cancelled by the user";

/**
 * Cancel vs concurrent startExecute: a newer staged prompt or a different
 * tracked workflow must not be treated as the cancel's own turn.
 */
export function detectCancelSupersession(input: {
  latestPendingTurn?: { requestedAt: number };
  cancelPendingRequestedAt?: number;
  latestActiveWorkflowId?: string;
  cancelWorkflowId?: string;
}): {
  newerTurnStaged: boolean;
  newerWorkflowTracked: boolean;
  cancelOwnsCurrentTurn: boolean;
} {
  const newerTurnStaged =
    input.latestPendingTurn !== undefined &&
    input.latestPendingTurn.requestedAt !== input.cancelPendingRequestedAt;
  const newerWorkflowTracked =
    input.latestActiveWorkflowId !== undefined &&
    input.latestActiveWorkflowId !== input.cancelWorkflowId;
  return {
    newerTurnStaged,
    newerWorkflowTracked,
    cancelOwnsCurrentTurn: !newerTurnStaged && !newerWorkflowTracked,
  };
}

type CancellableChatEntity = {
  pendingTurn?: { requestedAt: number };
  syntheticTurnMessageId?: Id<"messages">;
};

/**
 * Shared body of the session, task-chat and project-chat `cancelExecution`
 * mutations (after the access check). Cancels the tracked workflow, runs the
 * surface's interrupt, closes the turn, and — when the cancel still owns the
 * current turn — finalizes the open assistant message and synthetic turn.
 * Returns what the caller may clear on its own row, or null when the entity
 * is gone. The caller patches, syncs daemon state and drains its queue.
 */
export async function cancelChatTurn<TEntity extends CancellableChatEntity>(
  ctx: MutationCtx,
  p: {
    id: ChatTurnEntityId;
    entity: TEntity;
    activeWorkflowId: (entity: TEntity) => string | undefined;
    streamingEntityId: string;
    interrupt: () => Promise<void>;
    getLatest: () => Promise<TEntity | null>;
  },
): Promise<{
  latest: TEntity;
  cancelOwnsCurrentTurn: boolean;
  clearsWorkflow: boolean;
  clearsPendingTurn: boolean;
} | null> {
  // Snapshot what this cancel owns. A concurrent startExecute may stage a
  // newer pendingTurn / workflow while we run — must not clear those or mark
  // the newer assistant placeholder as cancelled.
  const workflowIdToCancel = p.activeWorkflowId(p.entity);
  const pendingRequestedAt = p.entity.pendingTurn?.requestedAt;

  await cancelTrackedWorkflow(ctx, workflowIdToCancel);
  await p.interrupt();

  if (workflowIdToCancel !== undefined) {
    await closeTurnForWorkflow(ctx, p.id, workflowIdToCancel, "cancelled", {
      error: CANCELLED_BY_USER,
    });
  }

  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", p.streamingEntityId))
    .first();

  const latest = await p.getLatest();
  if (!latest) return null;
  const latestWorkflowId = p.activeWorkflowId(latest);

  const { cancelOwnsCurrentTurn } = detectCancelSupersession({
    latestPendingTurn: latest.pendingTurn,
    cancelPendingRequestedAt: pendingRequestedAt,
    latestActiveWorkflowId: latestWorkflowId,
    cancelWorkflowId: workflowIdToCancel,
  });

  if (cancelOwnsCurrentTurn) {
    const syntheticTurnMessageId = latest.syntheticTurnMessageId;
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", p.id))
      .order("desc")
      .first();
    if (
      last &&
      last.role === "assistant" &&
      last.finishedAt === undefined &&
      last._id !== syntheticTurnMessageId
    ) {
      await finalizeCancelledAssistantMessage(ctx, last, streaming);
    }
    await finalizeOpenSyntheticTurnOnCancel(
      ctx,
      syntheticTurnMessageId,
      streaming,
    );
    await closeOpenTurn(ctx, p.id, "cancelled", { error: CANCELLED_BY_USER });
  }

  await clearStreamingActivity(ctx, p.streamingEntityId);

  return {
    latest,
    cancelOwnsCurrentTurn,
    clearsWorkflow:
      workflowIdToCancel !== undefined &&
      latestWorkflowId === workflowIdToCancel,
    clearsPendingTurn:
      pendingRequestedAt !== undefined &&
      latest.pendingTurn?.requestedAt === pendingRequestedAt,
  };
}
