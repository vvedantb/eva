import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { cancelTrackedWorkflow } from "../workflowManager";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { finalizeCancelledAssistantMessage } from "../streaming";
import type { ChatAlert, ChatSurfaceAdapter } from "./surfaceAdapters";
import { closeTurnForWorkflow } from "./turnStore";

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

type ChatId = Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;

/**
 * Tears down one tracked chat turn (session, task chat, or project chat):
 * cancels the workflow, salvages the open assistant bubble (streamed text and
 * tool steps survive; an empty bubble is dropped), surfaces the failure as a
 * standalone system alert, interrupts any still-alive agent process the way
 * cancelExecution does, and starts the next queued message. The caller must
 * have verified `adapter.activeWorkflowId(entity) === workflowId`; mutation
 * atomicity makes that guard plus these writes race-free against a
 * concurrent startExecute.
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
  // Read the streaming row BEFORE cancelStaleWorkflow clears it — it feeds
  // the salvage of streamed text / tool steps below.
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

  const last = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", id))
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

  await ctx.db.insert("messages", {
    parentId: id,
    role: "assistant",
    content: alert.text,
    timestamp: Date.now(),
    isSystemAlert: true,
    ...(alert.detail !== undefined ? { errorDetail: alert.detail } : {}),
  });

  // A stale heartbeat usually means the agent process is dead, but a merely
  // wedged one must not keep mutating the sandbox after the turn moves on to
  // its next one — interrupt it the same way cancelExecution does. When the
  // sandbox itself has stopped there is nothing to interrupt, and killing it
  // would exec on the stopped VM — which lazily RESUMES it on Vercel (see
  // prewarmNeverResurrects contract) — so skip the interrupt entirely.
  if (opts.sandboxStopped !== true) {
    await adapter.interrupt(ctx, entity);
  }

  // The 2-hour backstop and the lease reconciler can both reach one turn.
  // Closing the durable turn here stops the reconciler from tearing the same
  // turn down a second time.
  await closeTurnForWorkflow(ctx, id, workflowId, "error", {
    error: alert.text,
  });

  await adapter.release(ctx, id, {
    sandboxStopped: opts.sandboxStopped === true,
  });

  await adapter.drainQueue(ctx, id);
}
