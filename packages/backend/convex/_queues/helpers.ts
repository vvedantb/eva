import { bumpThreadRoot } from "../_messages/replies";
import { v } from "convex/values";
import {
  queueRuntimeContinue,
  type StickyComposerTraits,
} from "../_chat/runtimeContinue";
import { internalMutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { WorkflowId } from "@convex-dev/workflow";
import { internal } from "../_generated/api";
import { workflow } from "../workflowManager";
import {
  DEFAULT_AI_MODEL,
  launchTraitsFromStored,
  normalizeAIModel,
  usesChatDaemon,
} from "../validators";
import type { AIProvider } from "../validators";
import { queuedMessageFields } from "../_validators/tableFields";
import { reclaimQueuedAttachments } from "./attachments";
import {
  backgroundAgentsExpireAt,
  runningBackgroundAgents,
} from "../_sessions/backgroundAgents";
import type { BackgroundAgentEntry } from "../_validators/tableFields";
import { trackSessionChatWorkflow } from "../_chat/surfaceAdapters";
import { resolveMessageCredential } from "../_userProviderAccounts/credentialSource";
import { sessionAccountHolder } from "../_projects/runSettings";
import { resolveTurnProviderAccountId } from "../_userProviderAccounts/defaults";
import { maybeInsertModelHandoffAlert } from "../_shared/modelHandoff";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { hasOpenChatTurn } from "../_chat/turnProjection";
import {
  activityRefForParentId,
  touchUserActivity,
} from "../_sandbox/activity";
import type { OrchestratorNotifyChild } from "../orchestratorShared";
import {
  findUsageLimitHold,
  isHeldByUsageLimit,
  type UsageLimitHold,
} from "../_taskWorkflow/usageLimitReset";
import { findOpenChatQuestion } from "../pendingQuestions";
import { requestSessionSandboxStart } from "../_sessions/sandbox";
import { buildSessionPrompt } from "../_sessions/sessionPrompt";
import { sessionOwner } from "../_sessions/owner";
import {
  buildDaemonPendingTurn,
  scheduleChatDaemonPrewarm,
} from "../_sessions/daemonTurn";
import {
  bindTurnWorkflow,
  closeTurn,
  findOpenTurn,
  openSessionChatTurn,
  type ChatTurnEntityId,
} from "../_chat/turnStore";
import {
  listLiveSessionChats,
  loadSessionChat,
  sessionChatHasFreeSlot,
  sessionChatStreamingEntityId,
  type SessionChatContext,
} from "../_sessionChats/helpers";

const BACKGROUND_AGENT_DRAIN_DELAY_MS = 15 * 1000;

type QueueSandboxState = "awake" | "asleep" | "transitioning";

function sandboxStateFromStatus(
  status: Doc<"sessions">["status"] | undefined,
): QueueSandboxState {
  if (status === "active") return "awake";
  if (status === "starting" || status === "stopping") return "transitioning";
  return "asleep";
}

type ChatQueueGuardResult<TPrepared> =
  | { ok: true; data: TPrepared }
  | { ok: false; error: string };

type ChatQueueId = Id<"sessionChats">;

type ChatQueueConfig<TId extends ChatQueueId, TEntity, TPrepared> = {
  getEntity: (ctx: MutationCtx, id: TId) => Promise<TEntity | null>;
  hasActiveWorkflow: (
    entity: TEntity,
    ctx: MutationCtx,
  ) => boolean | Promise<boolean>;
  hasCapacity: (ctx: MutationCtx, entity: TEntity) => Promise<boolean>;
  activityParentId: (entity: TEntity, id: TId) => string;
  sandboxState: (entity: TEntity) => QueueSandboxState;
  wakeSandbox: (ctx: MutationCtx, entity: TEntity) => Promise<void>;
  backgroundAgents: (entity: TEntity) => BackgroundAgentEntry[] | undefined;
  syntheticTurnMessageId: (entity: TEntity) => Id<"messages"> | undefined;
  queueHeldAt: (entity: TEntity) => number | undefined;
  streamingEntityId: (id: TId) => string;
  fallbackProvider: (entity: TEntity) => AIProvider | undefined;
  stickyTraits: (entity: TEntity) => StickyComposerTraits;
  turnAccountId: (
    ctx: MutationCtx,
    entity: TEntity,
    next: Doc<"queuedMessages">,
  ) => Promise<Id<"userProviderAccounts"> | undefined>;
  prepareGuard: (
    ctx: MutationCtx,
    entity: TEntity,
    next: Doc<"queuedMessages">,
    providerAccountId: Id<"userProviderAccounts"> | undefined,
  ) => Promise<ChatQueueGuardResult<TPrepared>>;
  insertUserMessage: (
    ctx: MutationCtx,
    id: TId,
    entity: TEntity,
    next: Doc<"queuedMessages">,
    prepared: TPrepared,
    now: number,
  ) => Promise<void>;
  startWorkflow: (
    ctx: MutationCtx,
    id: TId,
    entity: TEntity,
    next: Doc<"queuedMessages">,
    prepared: TPrepared,
  ) => Promise<WorkflowId>;
  onStarted: (
    ctx: MutationCtx,
    id: TId,
    workflowId: WorkflowId,
    now: number,
  ) => Promise<void>;
  recordError: (
    ctx: MutationCtx,
    id: TId,
    content: string,
    replyTo: Id<"messages"> | undefined,
  ) => Promise<void>;
  orchestratorNotifyChild: (
    ctx: MutationCtx,
    entity: TEntity,
    id: TId,
  ) => Promise<OrchestratorNotifyChild | undefined>;
  defaultStartErrorMessage: string;
};

async function isSurfaceBusy<TId extends ChatQueueId, TEntity, TPrepared>(
  ctx: MutationCtx,
  entity: TEntity,
  config: ChatQueueConfig<TId, TEntity, TPrepared>,
): Promise<boolean> {
  if (await config.hasActiveWorkflow(entity, ctx)) {
    return true;
  }
  if (!(await config.hasCapacity(ctx, entity))) {
    return true;
  }
  if (
    config.sandboxState(entity) === "awake" &&
    runningBackgroundAgents(config.backgroundAgents(entity), Date.now())
      .length > 0
  ) {
    return true;
  }
  const syntheticTurnMessageId = config.syntheticTurnMessageId(entity);
  if (syntheticTurnMessageId === undefined) {
    return false;
  }
  const syntheticTurn = await ctx.db.get(syntheticTurnMessageId);
  return syntheticTurn !== null && syntheticTurn.finishedAt === undefined;
}

async function scheduleDrainAtBackgroundAgentExpiry<
  TId extends ChatQueueId,
  TEntity,
  TPrepared,
>(
  ctx: MutationCtx,
  id: TId,
  entity: TEntity,
  config: ChatQueueConfig<TId, TEntity, TPrepared>,
): Promise<void> {
  if (await config.hasActiveWorkflow(entity, ctx)) return;
  if (config.sandboxState(entity) !== "awake") return;
  const now = Date.now();
  const expiresAt = backgroundAgentsExpireAt(
    config.backgroundAgents(entity),
    now,
  );
  if (expiresAt === null) return;
  const queued = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", id))
    .order("asc")
    .first();
  if (!queued) return;
  await ctx.scheduler.runAfter(
    Math.max(0, expiresAt - now) + BACKGROUND_AGENT_DRAIN_DELAY_MS,
    internal._queues.helpers.drainQueueAfterBackgroundAgents,
    { parentId: id },
  );
}

export async function dropComposerUserRow(
  ctx: MutationCtx,
  parentId: ChatQueueId,
  content: string,
): Promise<Id<"_storage">[] | undefined> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .take(20);
  for (const message of recent) {
    if (message.role === "assistant" && message.finishedAt !== undefined) {
      return undefined;
    }
    if (message.role === "user" && message.content === content) {
      await ctx.db.delete(message._id);
      return message.attachmentStorageIds;
    }
  }
  return undefined;
}

export async function usageLimitHoldFor(
  ctx: QueryCtx,
  parentId: ChatQueueId,
  next: Doc<"queuedMessages">,
  providerAccountId: Id<"userProviderAccounts"> | undefined,
): Promise<UsageLimitHold | null> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .take(20);
  const hold = findUsageLimitHold(recent, Date.now());
  return isHeldByUsageLimit(
    hold,
    next.model ?? DEFAULT_AI_MODEL,
    providerAccountId ?? null,
  )
    ? hold
    : null;
}

async function nextRunnableQueuedMessage(
  ctx: MutationCtx,
  id: ChatQueueId,
  queueHeldAt: number | undefined,
): Promise<Doc<"queuedMessages"> | null> {
  const queue = ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", id))
    .order("asc");
  const askedAt = (await findOpenChatQuestion(ctx.db, id))?.finishedAt;
  const heldBefore = Math.max(askedAt ?? 0, queueHeldAt ?? 0);
  if (heldBefore === 0) return await queue.first();
  for await (const message of queue) {
    if (message.createdAt > heldBefore) return message;
  }
  return null;
}

async function startNextQueuedChatMessage<
  TId extends ChatQueueId,
  TEntity,
  TPrepared,
>(
  ctx: MutationCtx,
  id: TId,
  config: ChatQueueConfig<TId, TEntity, TPrepared>,
  trigger: "turn-ended" | "quiet",
): Promise<boolean> {
  const entity = await config.getEntity(ctx, id);
  if (!entity) return false;
  if (trigger === "turn-ended") {
    await queueRuntimeContinue(ctx, id, config.stickyTraits(entity));
  }
  if (await isSurfaceBusy(ctx, entity, config)) {
    await scheduleDrainAtBackgroundAgentExpiry(ctx, id, entity, config);
    return false;
  }

  const watchedChild =
    trigger === "turn-ended"
      ? await config.orchestratorNotifyChild(ctx, entity, id)
      : undefined;
  async function notifyWatchingOrchestrator(status: string): Promise<void> {
    if (!watchedChild) return;
    await ctx.scheduler.runAfter(
      0,
      internal.orchestratorNotify.notifyOrchestratorOfChild,
      { child: watchedChild, status },
    );
  }

  const nextMessage = await nextRunnableQueuedMessage(
    ctx,
    id,
    config.queueHeldAt(entity),
  );
  if (!nextMessage) {
    await notifyWatchingOrchestrator("completed");
    return false;
  }

  let providerAccountId: Id<"userProviderAccounts"> | undefined;
  try {
    providerAccountId = await config.turnAccountId(ctx, entity, nextMessage);
  } catch (error) {
    await ctx.db.delete(nextMessage._id);
    await reclaimQueuedAttachments(ctx, nextMessage);
    const reason =
      error instanceof Error ? error.message : config.defaultStartErrorMessage;
    await config.recordError(ctx, id, `Error: ${reason}`, nextMessage.replyTo);
    await notifyWatchingOrchestrator("error");
    return false;
  }

  const hold = await usageLimitHoldFor(ctx, id, nextMessage, providerAccountId);
  if (hold !== null) {
    await ctx.scheduler.runAt(
      hold.resumeAt,
      internal._queues.helpers.drainQueueQuietly,
      { parentId: id },
    );
    await notifyWatchingOrchestrator("error");
    return false;
  }

  if (trigger === "quiet") {
    const sandbox = config.sandboxState(entity);
    if (sandbox === "asleep") await config.wakeSandbox(ctx, entity);
    if (sandbox !== "awake") return false;
  }

  await ctx.db.delete(nextMessage._id);

  const guard = await config.prepareGuard(
    ctx,
    entity,
    nextMessage,
    providerAccountId,
  );
  if (!guard.ok) {
    await reclaimQueuedAttachments(ctx, nextMessage);
    await config.recordError(ctx, id, guard.error, nextMessage.replyTo);
    await notifyWatchingOrchestrator("error");
    return false;
  }

  await clearStreamingActivity(ctx, config.streamingEntityId(id));

  const now = Date.now();
  await config.insertUserMessage(ctx, id, entity, nextMessage, guard.data, now);
  const activityRef = activityRefForParentId(
    ctx.db,
    config.activityParentId(entity, id),
  );
  if (activityRef) {
    await touchUserActivity(
      ctx,
      activityRef,
      { source: "chat", userId: nextMessage.userId },
      now,
    );
  }
  await maybeInsertModelHandoffAlert(
    ctx,
    id,
    nextMessage.model ?? DEFAULT_AI_MODEL,
    config.fallbackProvider(entity),
    nextMessage.replyTo,
  );

  try {
    const workflowId = await config.startWorkflow(
      ctx,
      id,
      entity,
      nextMessage,
      guard.data,
    );
    await config.onStarted(ctx, id, workflowId, now);
    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : config.defaultStartErrorMessage;
    await config.recordError(
      ctx,
      id,
      `Error: ${errorMessage}`,
      nextMessage.replyTo,
    );
    await notifyWatchingOrchestrator("error");
    return false;
  }
}

type SessionQueuePrepared = {
  repo: Doc<"githubRepos">;
  model: NonNullable<Doc<"queuedMessages">["model"]>;
  providerAccountId: Id<"userProviderAccounts"> | undefined;
};

/** Reverts the durable rows created immediately before a queued workflow start. */
export async function rollbackQueuedChatStart(
  ctx: MutationCtx,
  params: {
    entityId: ChatTurnEntityId;
    turnId: Id<"turns">;
    placeholderMessageId: Id<"messages">;
  },
): Promise<void> {
  const turn = await ctx.db.get(params.turnId);
  if (turn) {
    await closeTurn(ctx, turn, "error", {
      error: "Queued workflow failed to start",
    });
  }
  const placeholder = await ctx.db.get(params.placeholderMessageId);
  if (
    placeholder?.parentId === params.entityId &&
    placeholder.finishedAt === undefined
  ) {
    await ctx.db.delete(params.placeholderMessageId);
  }
}

async function bindOpenTurnWorkflow(
  ctx: MutationCtx,
  entityId: ChatTurnEntityId,
  workflowId: WorkflowId,
): Promise<void> {
  const turn = await findOpenTurn(ctx, entityId);
  if (turn) await bindTurnWorkflow(ctx, turn._id, String(workflowId));
}

const sessionChatQueueConfig: ChatQueueConfig<
  Id<"sessionChats">,
  SessionChatContext,
  SessionQueuePrepared
> = {
  getEntity: (ctx, id) => loadSessionChat(ctx.db, id),
  hasActiveWorkflow: ({ chat }, ctx) => hasOpenChatTurn(ctx.db, chat._id),
  hasCapacity: (ctx, context) => sessionChatHasFreeSlot(ctx.db, context),
  activityParentId: ({ session }) => String(session._id),
  sandboxState: ({ session }) => sandboxStateFromStatus(session.status),
  wakeSandbox: (ctx, { session }) => requestSessionSandboxStart(ctx, session),
  backgroundAgents: ({ chat }) => chat.backgroundAgents,
  syntheticTurnMessageId: ({ chat }) => chat.syntheticTurnMessageId,
  queueHeldAt: ({ chat }) => chat.queueHeldAt,
  streamingEntityId: (id) => sessionChatStreamingEntityId(id),
  fallbackProvider: ({ chat }) => chat.provider,
  stickyTraits: ({ chat }) => chat,
  turnAccountId: async (ctx, { session }, next) =>
    await resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: next.providerAccountId,
      ownerUserId: await sessionAccountHolder(
        ctx.db,
        session,
        next.providerAccountId,
      ),
      model: next.model,
      changePolicy: "owner-pool",
    }),
  prepareGuard: async (ctx, { session, chat }, next, providerAccountId) => {
    if (!next.model) {
      return { ok: false, error: "Error: Failed to start queued message." };
    }
    if (chat.archived === true) {
      return { ok: false, error: "Error: This chat is closed." };
    }
    const repo = await ctx.db.get(session.repoId);
    if (!repo) {
      return {
        ok: false,
        error: "Error: Repository not found for queued message.",
      };
    }
    return { ok: true, data: { repo, model: next.model, providerAccountId } };
  },
  insertUserMessage: async (ctx, id, { session }, next, prepared, now) => {
    if (next.replyTo !== undefined) return;
    await ctx.db.insert("messages", {
      parentId: id,
      role: "user",
      content: next.displayContent ?? next.content,
      timestamp: now,
      userId: next.userId,
      attachmentStorageIds: next.attachmentStorageIds,
      ...(await resolveMessageCredential(
        ctx.db,
        prepared.providerAccountId,
        await sessionAccountHolder(ctx.db, session, prepared.providerAccountId),
      )),
      model: prepared.model,
      reasoningLevel: next.reasoningLevel,
      orchestratorNotification: next.orchestratorNotification,
      sentViaOrchestrator: next.sentViaOrchestrator,
    });
  },
  startWorkflow: async (ctx, id, { session, chat }, next, prepared) => {
    const placeholderMessageId = await ctx.db.insert("messages", {
      parentId: id,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      activityLog: "",
      replyTo: next.replyTo,
    });
    if (next.replyTo !== undefined) {
      await bumpThreadRoot(ctx, next.replyTo, undefined);
    }
    const turnId = await openSessionChatTurn(ctx, {
      chatId: id,
      sessionId: session._id,
      streamingEntityId: sessionChatStreamingEntityId(id),
      placeholderMessageId,
      prompt: next.content,
      attachmentStorageIds: next.attachmentStorageIds,
      model: prepared.model,
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      replyTo: next.replyTo,
    });
    const model = normalizeAIModel(prepared.model);
    const launchTraits = launchTraitsFromStored(model, {
      reasoningLevel: next.reasoningLevel,
      thinkingEnabled: next.thinkingEnabled,
      use1mContext: next.use1mContext,
      fastMode: next.fastMode,
    });
    if (usesChatDaemon(model)) {
      const { prompt } = await buildSessionPrompt(ctx, {
        session,
        chat,
        repo: prepared.repo,
        user: await ctx.db.get(next.userId),
        message: next.content,
        model,
      });
      await ctx.db.patch(id, {
        pendingTurn: buildDaemonPendingTurn({
          prompt,
          turnId,
          attachmentStorageIds: next.attachmentStorageIds,
          model,
        }),
      });
      await scheduleChatDaemonPrewarm(ctx, {
        session,
        chat,
        userId: next.userId,
        model,
        launchTraits,
        providerAccountId: prepared.providerAccountId,
      });
    }
    try {
      return await workflow.start(
        ctx,
        internal.sessionWorkflow.sessionExecuteWorkflow,
        {
          chatId: id,
          message: next.content,
          model: prepared.model,
          ...launchTraits,
          providerAccountId: prepared.providerAccountId,
          credentialOwnerUserId: await sessionAccountHolder(
            ctx.db,
            session,
            prepared.providerAccountId,
          ),
          userId: next.userId,
          installationId: prepared.repo.installationId,
          turnId,
        },
      );
    } catch (error) {
      await rollbackQueuedChatStart(ctx, {
        entityId: id,
        turnId,
        placeholderMessageId,
      });
      throw error;
    }
  },
  onStarted: async (ctx, id, workflowId, now) => {
    await bindOpenTurnWorkflow(ctx, id, workflowId);
    await ctx.db.patch(id, { updatedAt: now });
    await trackSessionChatWorkflow(ctx, id, workflowId);
  },
  recordError: async (ctx, id, content, replyTo) => {
    await ctx.db.insert("messages", {
      parentId: id,
      role: "assistant",
      content,
      timestamp: Date.now(),
      replyTo,
    });
    if (replyTo !== undefined) await bumpThreadRoot(ctx, replyTo, undefined);
    await ctx.db.patch(id, { updatedAt: Date.now() });
  },
  orchestratorNotifyChild: async (ctx, { session }, id) => {
    const owner = sessionOwner(session);
    if (owner.kind === "task") {
      const task = await ctx.db.get(owner.taskId);
      return task?.watchedByAve === undefined
        ? undefined
        : { kind: "task", taskId: owner.taskId };
    }
    if (owner.kind === "project") {
      const project = await ctx.db.get(owner.projectId);
      return project?.watchedByAve === undefined
        ? undefined
        : { kind: "project", projectId: owner.projectId };
    }
    return session.watchedByAve === undefined
      ? undefined
      : { kind: "session", sessionId: session._id, chatId: id };
  },
  defaultStartErrorMessage: "Failed to start queued message.",
};

/**
 * The drain every session-chat turn ending calls. Drains the chat that just
 * finished first (its own queue has priority on the slot it just freed), then
 * offers the remaining slots to sibling chats with queued messages — the only
 * place a message parked by the parallel-chat cap is released. Returns whether
 * the finished chat started a turn.
 */
export async function drainSessionChatQueues(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  finishedChatId?: Id<"sessionChats">,
  trigger: "turn-ended" | "quiet" = "turn-ended",
): Promise<boolean> {
  let started = false;
  if (finishedChatId !== undefined) {
    started = await startNextQueuedChatMessage(
      ctx,
      finishedChatId,
      sessionChatQueueConfig,
      trigger,
    );
  }
  const siblings = await listLiveSessionChats(ctx.db, sessionId);
  for (const chat of siblings) {
    if (chat._id === finishedChatId) continue;
    await startNextQueuedChatMessage(
      ctx,
      chat._id,
      sessionChatQueueConfig,
      "quiet",
    );
  }
  return started;
}

/**
 * A drain that is not a turn ending — sandbox ready, a fresh enqueue, a
 * usage-limit resume, a provider switch. Never wakes a watching orchestrator,
 * and wakes a sleeping sandbox rather than starting a turn on it (see
 * `startNextQueuedChatMessage`).
 */
export async function drainChatQueueQuietly(
  ctx: MutationCtx,
  parentId: string,
): Promise<boolean> {
  const sessionId = ctx.db.normalizeId("sessions", parentId);
  if (sessionId) {
    await drainSessionChatQueues(ctx, sessionId, undefined, "quiet");
    return false;
  }
  const chatId = ctx.db.normalizeId("sessionChats", parentId);
  if (chatId) {
    return startNextQueuedChatMessage(
      ctx,
      chatId,
      sessionChatQueueConfig,
      "quiet",
    );
  }
  return false;
}

/**
 * Scheduled quiet drain: resumes a queue held by a usage limit
 * (`usageLimitHoldFor`), and drains after a sandbox start (scheduled by the
 * sandbox modules, which cannot import these helpers without a cycle).
 */
export const drainQueueQuietly = internalMutation({
  args: { parentId: queuedMessageFields.parentId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await drainChatQueueQuietly(ctx, args.parentId);
    return null;
  },
});

/**
 * Scheduled turn-ended drain. Used for the releases the surfaces cannot signal
 * themselves: the last backgrounded subagent settling
 * (`scheduleQueueDrainAfterBackgroundAgents`), and a subagent that never
 * settles ageing past the block cap (`scheduleDrainAtBackgroundAgentExpiry`).
 * The stall watchdog uses it too (`scheduleTurnEndedDrain`), so a failing
 * drain can never roll back the closing of a dead turn. The name predates
 * the watchdog use; it stays, because functions already scheduled under it
 * must still resolve after a deploy.
 */
export const drainQueueAfterBackgroundAgents = internalMutation({
  args: { parentId: queuedMessageFields.parentId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chatId = ctx.db.normalizeId("sessionChats", args.parentId);
    if (chatId) {
      const chat = await ctx.db.get(chatId);
      if (chat) await drainSessionChatQueues(ctx, chat.sessionId, chatId);
    }
    return null;
  },
});

/**
 * Called by each surface's `updateBackgroundAgents` after merging a daemon
 * patch. Schedules the retry drain only once the merged roster has nothing
 * still running, so a mid-fan-out settle costs nothing.
 */
export async function scheduleQueueDrainAfterBackgroundAgents(
  ctx: MutationCtx,
  parentId: ChatQueueId,
  mergedAgents: BackgroundAgentEntry[],
): Promise<void> {
  if (runningBackgroundAgents(mergedAgents, Date.now()).length > 0) {
    return;
  }
  await ctx.scheduler.runAfter(
    BACKGROUND_AGENT_DRAIN_DELAY_MS,
    internal._queues.helpers.drainQueueAfterBackgroundAgents,
    { parentId },
  );
}
