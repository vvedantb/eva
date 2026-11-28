import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { cancelTrackedWorkflow } from "../workflowManager";
import {
  clearStreamingActivity,
  finalizeCancelledAssistantMessage,
} from "../streaming";
import type { ChatAlert, ChatSurfaceAdapter } from "./surfaceAdapters";
import { closeTurnForWorkflow } from "./turnStore";
import { insertTurnFollowUp } from "../_messages/replies";
import {
  detachPendingQuestions,
  findOpenChatQuestion,
} from "../pendingQuestions";

/**
 * Cancels a workflow by ID and clears streaming activity for associated
 * entities. Shared by every stale-workflow handler in `workflowWatchdog.ts`
 * (chat and non-chat alike).
 */
export async function cancelStaleWorkflow(
  ctx: MutationCtx,
  workflowId: string,
  streamingEntityIds: string[],
): Promise<void> {
  await cancelTrackedWorkflow(ctx, workflowId);
  for (const entityId of streamingEntityIds) {
    await clearStreamingActivity(ctx, entityId);
  }
}

type ChatId = Id<"sessionChats">;

/**
 * Tears down one tracked session chat turn:
 * cancels the workflow, salvages the open assistant bubble (streamed text and
 * tool steps survive; an empty bubble is dropped), surfaces the failure as a
 * standalone system alert, interrupts any still-alive agent process the way
 * cancelExecution does, and schedules the next queued message. The caller must
 * have verified `adapter.activeWorkflowId(entity) === workflowId`; mutation
 * atomicity makes that guard plus these writes race-free against a
 * concurrent send staging a turn.
 *
 * Single implementation for all three chat surfaces — everything
 * surface-specific (field names, alert wording, interrupt mechanics, the
 * stopped-sandbox status field) lives in `adapter`.
 */
export async function finalizeStaleChatTurn<TId extends ChatId, TEntity>(
  ctx: MutationCtx,
  adapter: ChatSurfaceAdapter<TId, TEntity>,
  id: TId,
  entity: TEntity,
  workflowId: string,
  alert: ChatAlert,
  opts: { sandboxStopped?: boolean } = {},
): Promise<void> {
  const streamEntityId = adapter.streamingEntityId(id);
  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", streamEntityId))
    .first();

  await cancelStaleWorkflow(ctx, workflowId, [
    streamEntityId,
    ...adapter.extraStreamingClears(id),
  ]);

  const syntheticTurnMessageId = adapter.syntheticTurnMessageId(entity);
  if (syntheticTurnMessageId) {
    const syntheticMessage = await ctx.db.get(syntheticTurnMessageId);
    if (syntheticMessage && syntheticMessage.finishedAt === undefined) {
      await finalizeCancelledAssistantMessage(ctx, syntheticMessage, streaming);
    }
  }

  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", id))
    .order("desc")
    .take(20);
  const last = recent.find(
    (message) => !(message.role === "user" && message.replyTo !== undefined),
  );
  if (
    last &&
    last.role === "assistant" &&
    last.finishedAt === undefined &&
    last._id !== syntheticTurnMessageId
  ) {
    await finalizeCancelledAssistantMessage(ctx, last, streaming);
  }

  await detachPendingQuestions(ctx.db, String(id));
  if ((await findOpenChatQuestion(ctx.db, id)) === null) {
    await insertTurnFollowUp(ctx, {
      parentId: id,
      role: "assistant",
      content: alert.text,
      timestamp: Date.now(),
      isSystemAlert: true,
      ...(alert.detail !== undefined ? { errorDetail: alert.detail } : {}),
    });
  }

  if (opts.sandboxStopped !== true) {
    await adapter.interrupt(ctx, entity);
  }

  await closeTurnForWorkflow(ctx, id, workflowId, "error", {
    error: alert.text,
  });

  await adapter.release(ctx, id, {
    sandboxStopped: opts.sandboxStopped === true,
  });

  await scheduleTurnEndedDrain(ctx, id);
}

/**
 * Starts the next queued message in its OWN mutation, after the stall teardown
 * commits. Inline, any drain failure rolled the teardown back with it: on
 * 2026-11-11 a drain that hit Convex's 16 MiB read limit left a dead turn open
 * for hours, retried every minute, with Stop failing the same way. The turn
 * close must never depend on the next turn starting.
 */
export async function scheduleTurnEndedDrain(
  ctx: MutationCtx,
  id: ChatId,
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal._queues.helpers.drainQueueAfterBackgroundAgents,
    { parentId: id },
  );
}
