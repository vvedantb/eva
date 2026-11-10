import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeAIModel, supportsNativeSteer } from "../validators";
import { drainChatQueueQuietly } from "../_queues/helpers";
import { loadSessionChat } from "../_sessionChats/helpers";
import { cancelChatExecution } from "../_sessions/execution";
import { cancelTaskChatExecution } from "../agentTaskChatWorkflow";
import { cancelProjectChatExecution } from "../projectChatWorkflow";
import type { ChatEntityId } from "./surfaceAdapters";

/**
 * Steering: the user presses Steer on a queued message to send it now and
 * redirect the running agent (the queue never steers on its own).
 *
 * - `native`: the warm Claude/Codex daemon injects the message into its live
 *   turn. The row waits as `steer: "requested"` and the entity carries
 *   `steerRequestedAt`; the daemon's next claim takes it ("delivering") and
 *   acks it on the claim after (`./steerClaim.ts`). A delivered row is
 *   deleted. A rejected row, or one the turn ended before, stays at the
 *   front and runs as the next queued turn.
 * - `interrupt`: every other provider (Cursor, OpenCode), a model switch or
 *   an attachment. The row moves to the front and the turn is cancelled; the
 *   cancel drains the queue, so the steer starts the next turn.
 * - `send`: nothing runs, so the row moves to the front and sends now.
 */
export type SteerDelivery = "native" | "interrupt" | "send";

/** Pure routing for one steer. Exported for tests. */
export function decideSteerDelivery(params: {
  /** A real (workflow-backed) turn is running. */
  hasActiveTurn: boolean;
  /** Something else keeps the chat busy (a synthetic turn). */
  isBusy: boolean;
  runningModel: string | undefined;
  steerModel: string | undefined;
  hasAttachments: boolean;
}): SteerDelivery {
  if (!params.hasActiveTurn) return params.isBusy ? "interrupt" : "send";
  const runningModel = normalizeAIModel(params.runningModel);
  const steerModel = normalizeAIModel(params.steerModel ?? runningModel);
  const native =
    supportsNativeSteer(runningModel) &&
    steerModel === runningModel &&
    !params.hasAttachments;
  return native ? "native" : "interrupt";
}

/** What one chat surface tells the steer router. */
type SteerTarget = {
  entityId: ChatEntityId;
  hasActiveTurn: boolean;
  isBusy: boolean;
  runningModel: string | undefined;
  /** Cancels the running turn; the cancel drains the queue. */
  interrupt: () => Promise<void>;
};

async function loadSteerTarget(
  ctx: MutationCtx,
  parentId: Doc<"queuedMessages">["parentId"],
): Promise<SteerTarget | null> {
  const chatId = ctx.db.normalizeId("sessionChats", parentId);
  if (chatId) {
    const context = await loadSessionChat(ctx.db, chatId);
    if (!context) return null;
    const { chat } = context;
    return {
      entityId: chatId,
      hasActiveTurn: chat.activeWorkflowId !== undefined,
      isBusy: chat.syntheticTurnMessageId !== undefined,
      runningModel: chat.lastModel,
      interrupt: () => cancelChatExecution(ctx, context),
    };
  }
  const taskId = ctx.db.normalizeId("agentTasks", parentId);
  if (taskId) {
    const task = await ctx.db.get(taskId);
    if (!task) return null;
    return {
      entityId: taskId,
      hasActiveTurn: task.activeChatWorkflowId !== undefined,
      isBusy: task.syntheticTurnMessageId !== undefined,
      runningModel: task.lastChatModel ?? task.model,
      interrupt: () => cancelTaskChatExecution(ctx, task),
    };
  }
  const projectId = ctx.db.normalizeId("projects", parentId);
  if (projectId) {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    return {
      entityId: projectId,
      hasActiveTurn: project.activeChatWorkflowId !== undefined,
      isBusy: project.syntheticTurnMessageId !== undefined,
      runningModel: project.lastChatModel ?? project.model,
      interrupt: () => cancelProjectChatExecution(ctx, project),
    };
  }
  return null;
}

/** Puts `message` ahead of every other queued message of its parent. */
async function moveToFront(
  ctx: MutationCtx,
  message: Doc<"queuedMessages">,
): Promise<void> {
  const first = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) =>
      q.eq("parentId", message.parentId),
    )
    .order("asc")
    .first();
  if (!first || first._id === message._id) return;
  await ctx.db.patch(message._id, { order: (first.order ?? 0) - 1 });
}

/** Sends one queued message now and redirects the running agent with it. */
export async function steerQueuedMessage(
  ctx: MutationCtx,
  message: Doc<"queuedMessages">,
): Promise<SteerDelivery | null> {
  if (message.steer !== undefined) return null;
  const target = await loadSteerTarget(ctx, message.parentId);
  if (!target) return null;
  await moveToFront(ctx, message);
  const delivery = decideSteerDelivery({
    hasActiveTurn: target.hasActiveTurn,
    isBusy: target.isBusy,
    runningModel: target.runningModel,
    steerModel: message.model,
    hasAttachments: (message.attachmentStorageIds ?? []).length > 0,
  });
  if (delivery === "native") {
    const now = Date.now();
    await ctx.db.patch(message._id, { steer: "requested" });
    await ctx.db.patch(target.entityId, {
      steerRequestedAt: now,
      updatedAt: now,
    });
  } else if (delivery === "interrupt") {
    await target.interrupt();
  } else {
    await drainChatQueueQuietly(ctx, target.entityId);
  }
  return delivery;
}
