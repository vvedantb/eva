import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { WorkflowId } from "@convex-dev/workflow";
import { internal } from "../_generated/api";
import { workflow } from "../workflowManager";
import {
  DEFAULT_AI_MODEL,
  getAIModelProvider,
  launchTraitsFromStored,
  normalizeAIModel,
} from "../validators";
import type { AIProvider } from "../validators";
import { queuedMessageFields } from "../_validators/tableFields";
import {
  backgroundAgentsExpireAt,
  runningBackgroundAgents,
} from "../_sessions/backgroundAgents";
import type { BackgroundAgentEntry } from "../_validators/tableFields";
import {
  PROJECT_CHAT_STREAM_PREFIX,
  TASK_CHAT_STREAM_PREFIX,
  trackAgentTaskChatWorkflow,
  trackProjectChatWorkflow,
  trackSessionWorkflow,
} from "../_chat/surfaceAdapters";
import { resolveCredentialSourceLabel } from "../_userProviderAccounts/credentialSource";
import { resolveTurnProviderAccountId } from "../_userProviderAccounts/defaults";
import { maybeInsertModelHandoffAlert } from "../_shared/modelHandoff";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import {
  activityRefForParentId,
  touchUserActivity,
} from "../_sandbox/activity";
import type { OrchestratorNotifyChild } from "../orchestratorShared";
import {
  findUsageLimitHold,
  type UsageLimitHold,
} from "../_taskWorkflow/usageLimitReset";
import { requestSessionSandboxStart } from "../_sessions/sandbox";
import { wakeTaskSandboxForQueue } from "../_agentTasks/sandbox";
import { wakeProjectSandboxForQueue } from "../_projects/sandbox";
import {
  bindTurnWorkflow,
  closeTurn,
  findOpenTurn,
  openChatTurn,
  openSessionTurn,
  type ChatTurnEntityId,
} from "../_chat/turnStore";

const QUEUE_RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * Grace period between the last subagent settling and the retry drain. The
 * daemon reacts to that same settle by opening a synthetic turn to process the
 * subagent's report (`ensureSyntheticTurn` in callback-src), so draining the
 * instant the settle lands would start the queued turn on top of it. The retry
 * re-checks `isSurfaceBusy`, so if that synthetic turn did open, this no-ops and
 * the turn's own completion drains the queue instead.
 */
const BACKGROUND_AGENT_DRAIN_DELAY_MS = 15 * 1000;

/** Where a chat's sandbox is, as the queue sees it. */
type QueueSandboxState = "awake" | "asleep" | "transitioning";

/**
 * One mapping for all three surfaces' sandbox status. Unset (a task or project
 * that never previewed) is asleep. Stopping counts as transitioning: a start
 * now would race the stop, so the message waits for the next wake.
 */
function sandboxStateFromStatus(
  status: "active" | "starting" | "stopping" | "closed" | undefined,
): QueueSandboxState {
  if (status === "active") return "awake";
  if (status === "starting" || status === "stopping") return "transitioning";
  return "asleep";
}

/** Outcome of a queue config's pre-start guard: `ok: false` aborts before anything is cleared or inserted. */
type ChatQueueGuardResult<TPrepared> =
  | { ok: true; data: TPrepared }
  | { ok: false; error: string };

/**
 * Everything `startNextQueuedChatMessage` needs to dequeue and start the next
 * queued turn for one chat surface. Every function that writes to the
 * entity's own table is a closure defined at the concrete adapter (so `TId`
 * is a single branded id there, never the generic union) — the shared core
 * below never calls `ctx.db.patch`/`ctx.db.insert` on the entity table
 * itself.
 */
type ChatQueueConfig<
  TId extends Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
  TEntity,
  TPrepared,
> = {
  getEntity: (ctx: MutationCtx, id: TId) => Promise<TEntity | null>;
  hasActiveWorkflow: (entity: TEntity) => boolean;
  /**
   * Where the chat's sandbox is. Only quiet drains read it: a message queued
   * while Eva sleeps wakes her, and the sandbox-ready drain sends it.
   */
  sandboxState: (entity: TEntity) => QueueSandboxState;
  /** Starts the sleeping sandbox (`sandboxState` returned "asleep"). */
  wakeSandbox: (ctx: MutationCtx, entity: TEntity) => Promise<void>;
  /** Backgrounded Agent/Task subagents, which outlive the turn that spawned them. */
  backgroundAgents: (entity: TEntity) => BackgroundAgentEntry[] | undefined;
  /** The daemon-minted continuation turn, if one is open. */
  syntheticTurnMessageId: (entity: TEntity) => Id<"messages"> | undefined;
  streamingEntityId: (id: TId) => string;
  /**
   * Provider the entity was created on, the legacy fallback for handoff
   * detection when the previous turn carries no model stamp.
   */
  fallbackProvider: (entity: TEntity) => AIProvider | undefined;
  /**
   * Validates the entity/message can start a workflow, returning any extra
   * data (e.g. session's repo + narrowed mode/model) the insert/start steps
   * need. Runs BEFORE the streaming row is cleared, matching current
   * behavior — a guard failure leaves nothing to clear.
   */
  prepareGuard: (
    ctx: MutationCtx,
    entity: TEntity,
    next: Doc<"queuedMessages">,
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
  /** Patches `updatedAt` and records the started workflow as this entity's active one. */
  onStarted: (
    ctx: MutationCtx,
    id: TId,
    workflowId: WorkflowId,
    now: number,
  ) => Promise<void>;
  /** Inserts an assistant error bubble and touches `updatedAt`. */
  recordError: (ctx: MutationCtx, id: TId, content: string) => Promise<void>;
  /**
   * The wake-up payload for the master session watching this entity, or
   * `undefined` when it is unwatched (or when the surface cannot be watched at
   * all). Read off the already-loaded entity, so the shared core below pays no
   * extra read and never has to guess a field name per surface.
   */
  orchestratorNotifyChild: (
    entity: TEntity,
    id: TId,
  ) => OrchestratorNotifyChild | undefined;
  defaultStartErrorMessage: string;
};

/**
 * True while the surface is still working on the previous turn. `activeWorkflowId`
 * alone is not enough: a backgrounded Agent/Task subagent keeps running after
 * the turn that spawned it completes, and the daemon opens a synthetic turn to
 * process whatever that subagent reports back. Dequeuing in either window
 * starts the queued message on top of work the user is still waiting on — the
 * "queued message ran while a subagent was working" bug.
 */
async function isSurfaceBusy<
  TId extends Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
  TEntity,
  TPrepared,
>(
  ctx: MutationCtx,
  entity: TEntity,
  config: ChatQueueConfig<TId, TEntity, TPrepared>,
): Promise<boolean> {
  if (config.hasActiveWorkflow(entity)) {
    return true;
  }
  if (
    runningBackgroundAgents(config.backgroundAgents(entity), Date.now())
      .length > 0
  ) {
    return true;
  }
  const syntheticTurnMessageId = config.syntheticTurnMessageId(entity);
  if (syntheticTurnMessageId === undefined) {
    return false;
  }
  // Check the message rather than trusting the id: a crashed daemon can leave
  // the id set on a turn that cleanup already finalized, which would wedge the
  // queue with nothing left to drain it.
  const syntheticTurn = await ctx.db.get(syntheticTurnMessageId);
  return syntheticTurn !== null && syntheticTurn.finishedAt === undefined;
}

/**
 * A drain blocked only by still-running subagents has no later signal if those
 * subagents never settle (dead daemon): `runningBackgroundAgents` drops them
 * after the cap, but nothing drains at that moment. Book the retry for then.
 * Skipped when a workflow or synthetic turn is what blocks — their completion
 * drains — and when nothing is queued. Repeated blocked drains may book
 * duplicates; `drainQueueAfterBackgroundAgents` re-checks and no-ops.
 */
async function scheduleDrainAtBackgroundAgentExpiry<
  TId extends Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
  TEntity,
  TPrepared,
>(
  ctx: MutationCtx,
  id: TId,
  entity: TEntity,
  config: ChatQueueConfig<TId, TEntity, TPrepared>,
): Promise<void> {
  if (config.hasActiveWorkflow(entity)) return;
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

/**
 * The usage-limit hold on `next`, if any: the chat's newest turn ran out of
 * usage on the same provider `next` would run on. A message moved to another
 * provider is not held — that is how switching provider sends the queue now.
 */
export async function usageLimitHoldFor(
  ctx: QueryCtx,
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
  next: Doc<"queuedMessages">,
): Promise<UsageLimitHold | null> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .take(20);
  const hold = findUsageLimitHold(recent, Date.now());
  if (hold === null) return null;
  if (hold.model === undefined) return hold;
  const heldProvider = getAIModelProvider(normalizeAIModel(hold.model));
  const nextProvider = getAIModelProvider(
    normalizeAIModel(next.model ?? DEFAULT_AI_MODEL),
  );
  return heldProvider === nextProvider ? hold : null;
}

/**
 * Dequeues and starts the next pending message for one chat surface. Single
 * implementation shared by sessions, project chat, and task chat — the three
 * exported `startNextQueuedX` functions below are thin `config` bindings so a
 * fix here reaches all three surfaces by construction.
 *
 * `trigger: "quiet"` is for the drains that are NOT a turn ending (sandbox
 * ready, enqueue, a usage-limit resume, a provider switch):
 * - they never wake a watching orchestrator. An empty queue there means
 *   "nothing was waiting", not "the child just went idle"; notifying, merely
 *   starting a watched chat's sandbox woke its master with a spurious
 *   "finished: completed" carrying the tail of an older reply.
 * - they only start a turn on an awake sandbox. A sleeping one is woken
 *   instead, and its sandbox-ready drain sends the message. A turn-ended drain
 *   skips this: the turn just ran there, and the task chat workflow starts its
 *   own sandbox when a follow-up outlives the first run.
 */
async function startNextQueuedChatMessage<
  TId extends Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
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
  if (await isSurfaceBusy(ctx, entity, config)) {
    await scheduleDrainAtBackgroundAgentExpiry(ctx, id, entity, config);
    return false;
  }

  /**
   * Wakes the master session watching this entity. Every turn-finished path
   * (workflow completion, synthetic turn, cancel, stall teardown) ends by
   * draining the queue here, and we only reach this function once the entity
   * has no active workflow — so "the drain started nothing" is exactly "the
   * child went idle". Hooking that single fact keeps mid-queue turns silent
   * without every completion mutation remembering to check.
   */
  const watchedChild =
    trigger === "turn-ended"
      ? config.orchestratorNotifyChild(entity, id)
      : undefined;
  async function notifyWatchingOrchestrator(status: string): Promise<void> {
    if (!watchedChild) return;
    await ctx.scheduler.runAfter(
      0,
      internal.orchestratorNotify.notifyOrchestratorOfChild,
      { child: watchedChild, status },
    );
  }

  const nextMessage = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", id))
    .order("asc")
    .first();
  if (!nextMessage) {
    await notifyWatchingOrchestrator("completed");
    return false;
  }

  // The last turn ran out of usage: sending now would only fail again, so the
  // queue waits for the reset. Every drain that lands here books the resume —
  // duplicates are harmless, since the first to run starts the turn and makes
  // the rest find the surface busy.
  const hold = await usageLimitHoldFor(ctx, id, nextMessage);
  if (hold !== null) {
    await ctx.scheduler.runAt(
      hold.resumeAt,
      internal._queues.helpers.drainQueueQuietly,
      { parentId: id },
    );
    // The turn that hit the limit failed and nothing runs until the reset.
    await notifyWatchingOrchestrator("error");
    return false;
  }

  if (trigger === "quiet") {
    const sandbox = config.sandboxState(entity);
    if (sandbox === "asleep") await config.wakeSandbox(ctx, entity);
    if (sandbox !== "awake") return false;
  }

  await ctx.db.delete(nextMessage._id);

  const guard = await config.prepareGuard(ctx, entity, nextMessage);
  if (!guard.ok) {
    await config.recordError(ctx, id, guard.error);
    // The queued turn is consumed and cannot run, so the child is idle again —
    // without this the master would wait forever on a turn that never starts.
    await notifyWatchingOrchestrator("error");
    return false;
  }

  // Wipe any stale streaming row before the new turn's placeholder appears —
  // a leftover row (old warm daemon, one-shot provider, crashed turn) would
  // render the finished turn's reply/activity under the new placeholder (see
  // startExecute in _sessions/execution.ts). Every dequeue does this, because
  // not every caller clears first: _sessions/sandbox.ts drains queued turns
  // straight after a resume, with no clear of its own.
  await clearStreamingActivity(ctx, config.streamingEntityId(id));

  const now = Date.now();
  await config.insertUserMessage(ctx, id, entity, nextMessage, guard.data, now);
  // A dequeued follow-up is the user's message landing: restart the idle clock.
  const activityRef = activityRefForParentId(ctx.db, String(id));
  if (activityRef) await touchUserActivity(ctx, activityRef, now);
  // After the user row exists, so detection sees the turn it is deciding about.
  await maybeInsertModelHandoffAlert(
    ctx,
    id,
    nextMessage.model ?? DEFAULT_AI_MODEL,
    config.fallbackProvider(entity),
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
    await config.recordError(ctx, id, `Error: ${errorMessage}`);
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

/** Binds the entity's open turn to the workflow the queue just started. */
async function bindOpenTurnWorkflow(
  ctx: MutationCtx,
  entityId: ChatTurnEntityId,
  workflowId: WorkflowId,
): Promise<void> {
  const turn = await findOpenTurn(ctx, entityId);
  if (turn) await bindTurnWorkflow(ctx, turn._id, String(workflowId));
}

/**
 * Opens the placeholder and durable turn for a queued task or project chat
 * message, then starts its workflow with the turn id. The workflow restages
 * `pendingTurn` with this turn id and prewarms the daemon itself.
 */
async function startQueuedEntityChatTurn(
  ctx: MutationCtx,
  params: {
    entityId: Id<"agentTasks"> | Id<"projects">;
    streamingEntityId: string;
    next: Doc<"queuedMessages">;
    sandboxId: string | undefined;
    repoId: Id<"githubRepos">;
  },
  start: (turnId: Id<"turns">) => Promise<WorkflowId>,
): Promise<WorkflowId> {
  const placeholderMessageId = await ctx.db.insert("messages", {
    parentId: params.entityId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    activityLog: "",
  });
  const turnId = await openChatTurn(ctx, {
    entityId: params.entityId,
    streamingEntityId: params.streamingEntityId,
    placeholderMessageId,
    prompt: params.next.content,
    attachmentStorageIds: params.next.attachmentStorageIds,
    model: normalizeAIModel(params.next.model ?? DEFAULT_AI_MODEL),
    sandboxId: params.sandboxId,
    repoId: params.repoId,
  });
  try {
    return await start(turnId);
  } catch (error) {
    await rollbackQueuedChatStart(ctx, {
      entityId: params.entityId,
      turnId,
      placeholderMessageId,
    });
    throw error;
  }
}

const sessionQueueConfig: ChatQueueConfig<
  Id<"sessions">,
  Doc<"sessions">,
  SessionQueuePrepared
> = {
  getEntity: (ctx, id) => ctx.db.get(id),
  hasActiveWorkflow: (session) => session.activeWorkflowId !== undefined,
  sandboxState: (session) => sandboxStateFromStatus(session.status),
  wakeSandbox: (ctx, session) => requestSessionSandboxStart(ctx, session),
  backgroundAgents: (session) => session.backgroundAgents,
  syntheticTurnMessageId: (session) => session.syntheticTurnMessageId,
  streamingEntityId: (id) => String(id),
  fallbackProvider: (session) => session.provider,
  prepareGuard: async (ctx, session, next) => {
    if (!next.model) {
      return { ok: false, error: "Error: Failed to start queued message." };
    }
    const repo = await ctx.db.get(session.repoId);
    if (!repo) {
      return {
        ok: false,
        error: "Error: Repository not found for queued message.",
      };
    }
    // Re-resolved here rather than trusted from enqueue time: the queued model
    // may belong to another provider than the stored pick.
    const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: next.providerAccountId,
      ownerUserId: session.createdBy ?? session.userId,
      model: next.model,
      changePolicy: "owner-pool",
    });
    return { ok: true, data: { repo, model: next.model, providerAccountId } };
  },
  insertUserMessage: async (ctx, id, session, next, prepared, now) => {
    await ctx.db.insert("messages", {
      parentId: id,
      role: "user",
      content: next.displayContent ?? next.content,
      timestamp: now,
      userId: next.userId,
      attachmentStorageIds: next.attachmentStorageIds,
      credentialSourceLabel: await resolveCredentialSourceLabel(
        ctx.db,
        prepared.providerAccountId,
        session.createdBy ?? session.userId,
      ),
      model: prepared.model,
      reasoningLevel: next.reasoningLevel,
      orchestratorNotification: next.orchestratorNotification,
      sentViaOrchestrator: next.sentViaOrchestrator,
    });
  },
  startWorkflow: async (ctx, id, session, next, prepared) => {
    const placeholderMessageId = await ctx.db.insert("messages", {
      parentId: id,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      activityLog: "",
    });
    const turnId = await openSessionTurn(ctx, {
      sessionId: id,
      streamingEntityId: String(id),
      placeholderMessageId,
      prompt: next.content,
      attachmentStorageIds: next.attachmentStorageIds,
      model: prepared.model,
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
    try {
      return await workflow.start(
        ctx,
        internal.sessionWorkflow.sessionExecuteWorkflow,
        {
          sessionId: id,
          message: next.content,
          model: prepared.model,
          // Normalised, not forwarded raw: the composer enqueues model defaults
          // explicitly (e.g. reasoning "high"), and the workflow feeds these
          // straight into prewarmSessionDaemon — a raw default yields a
          // different opts sig from the page-open prewarm and kills its daemon.
          ...launchTraitsFromStored(normalizeAIModel(prepared.model), {
            reasoningLevel: next.reasoningLevel,
            thinkingEnabled: next.thinkingEnabled,
            use1mContext: next.use1mContext,
            fastMode: next.fastMode,
          }),
          providerAccountId: prepared.providerAccountId,
          credentialOwnerUserId: session.createdBy ?? session.userId,
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
    await trackSessionWorkflow(ctx, id, workflowId, QUEUE_RUN_TIMEOUT_MS);
  },
  recordError: async (ctx, id, content) => {
    await ctx.db.insert("messages", {
      parentId: id,
      role: "assistant",
      content,
      timestamp: Date.now(),
    });
    await ctx.db.patch(id, { updatedAt: Date.now() });
  },
  orchestratorNotifyChild: (session, id) =>
    session.watchedByAve === undefined
      ? undefined
      : { kind: "session", sessionId: id },
  defaultStartErrorMessage: "Failed to start queued message.",
};

type ChatQueuePrepared = {
  providerAccountId: Id<"userProviderAccounts"> | undefined;
};

const projectChatQueueConfig: ChatQueueConfig<
  Id<"projects">,
  Doc<"projects">,
  ChatQueuePrepared
> = {
  getEntity: (ctx, id) => ctx.db.get(id),
  hasActiveWorkflow: (project) => project.activeChatWorkflowId !== undefined,
  sandboxState: (project) =>
    sandboxStateFromStatus(project.reviewProjectSandboxStatus),
  wakeSandbox: wakeProjectSandboxForQueue,
  backgroundAgents: (project) => project.backgroundAgents,
  syntheticTurnMessageId: (project) => project.syntheticTurnMessageId,
  streamingEntityId: (id) => `${PROJECT_CHAT_STREAM_PREFIX}${String(id)}`,
  fallbackProvider: (project) => getAIModelProvider(project.model),
  prepareGuard: async (ctx, project, next) => ({
    ok: true,
    data: {
      // Owner-only, and a collaborator's stored override is dropped rather than
      // resolved: raising here would strand the whole queue on one bad row.
      providerAccountId: await resolveTurnProviderAccountId(ctx.db, {
        requestedAccountId:
          next.userId === project.userId ? next.providerAccountId : undefined,
        ownerUserId: project.userId,
        currentAccountId: project.providerAccountId,
        model: next.model,
        senderUserId: next.userId,
        changePolicy: "owner-only",
        ownerNoun: "project owner",
      }),
    },
  }),
  insertUserMessage: async (ctx, id, project, next, prepared, now) => {
    await ctx.db.insert("messages", {
      parentId: id,
      role: "user",
      content: next.content,
      timestamp: now,
      userId: next.userId,
      attachmentStorageIds: next.attachmentStorageIds,
      credentialSourceLabel: await resolveCredentialSourceLabel(
        ctx.db,
        prepared.providerAccountId,
        project.userId,
      ),
      model: next.model,
      reasoningLevel: next.reasoningLevel,
    });
  },
  startWorkflow: async (ctx, id, project, next, prepared) => {
    return await startQueuedEntityChatTurn(
      ctx,
      {
        entityId: id,
        streamingEntityId: `${PROJECT_CHAT_STREAM_PREFIX}${String(id)}`,
        next,
        sandboxId: project.sandboxId,
        repoId: project.repoId,
      },
      (turnId) =>
        workflow.start(
          ctx,
          internal.projectChatWorkflow.projectChatExecuteWorkflow,
          {
            projectId: id,
            message: next.content,
            model: next.model ?? DEFAULT_AI_MODEL,
            // Normalised, not forwarded raw: the composer enqueues model defaults
            // explicitly (e.g. reasoning "high"), and the workflow feeds these
            // straight into prewarmEntityDaemon — a raw default yields a different
            // opts sig from the page-open prewarm and kills its daemon.
            ...launchTraitsFromStored(
              normalizeAIModel(next.model ?? DEFAULT_AI_MODEL),
              {
                reasoningLevel: next.reasoningLevel,
                thinkingEnabled: next.thinkingEnabled,
                use1mContext: next.use1mContext,
                fastMode: next.fastMode,
              },
            ),
            providerAccountId: prepared.providerAccountId,
            credentialOwnerUserId: project.userId,
            userId: next.userId,
            turnId,
          },
        ),
    );
  },
  onStarted: async (ctx, id, workflowId, now) => {
    await bindOpenTurnWorkflow(ctx, id, workflowId);
    await ctx.db.patch(id, { updatedAt: now });
    await trackProjectChatWorkflow(ctx, id, workflowId, QUEUE_RUN_TIMEOUT_MS);
  },
  recordError: async (ctx, id, content) => {
    await ctx.db.insert("messages", {
      parentId: id,
      role: "assistant",
      content,
      timestamp: Date.now(),
    });
    await ctx.db.patch(id, { updatedAt: Date.now() });
  },
  orchestratorNotifyChild: (project, id) =>
    project.watchedByAve === undefined
      ? undefined
      : { kind: "project", projectId: id },
  defaultStartErrorMessage: "Failed to start queued chat message.",
};

const taskChatQueueConfig: ChatQueueConfig<
  Id<"agentTasks">,
  Doc<"agentTasks">,
  ChatQueuePrepared
> = {
  getEntity: (ctx, id) => ctx.db.get(id),
  // `activeWorkflowId` counts too: the task's own run owns the sandbox, and a
  // follow-up may now be queued while that first run is still going. Starting
  // a chat turn on top of it would have two agents in one sandbox.
  hasActiveWorkflow: (task) =>
    task.activeChatWorkflowId !== undefined ||
    task.activeWorkflowId !== undefined,
  sandboxState: (task) => sandboxStateFromStatus(task.reviewTaskSandboxStatus),
  wakeSandbox: wakeTaskSandboxForQueue,
  backgroundAgents: (task) => task.backgroundAgents,
  syntheticTurnMessageId: (task) => task.syntheticTurnMessageId,
  streamingEntityId: (id) => `${TASK_CHAT_STREAM_PREFIX}${String(id)}`,
  fallbackProvider: (task) => getAIModelProvider(task.model),
  prepareGuard: async (ctx, task, next) => ({
    ok: true,
    data: {
      // Owner-only, and a collaborator's stored override is dropped rather than
      // resolved: raising here would strand the whole queue on one bad row.
      providerAccountId: await resolveTurnProviderAccountId(ctx.db, {
        requestedAccountId:
          next.userId === task.createdBy ? next.providerAccountId : undefined,
        ownerUserId: task.createdBy,
        currentAccountId: task.providerAccountId,
        model: next.model,
        senderUserId: next.userId,
        changePolicy: "owner-only",
        ownerNoun: "task owner",
      }),
    },
  }),
  insertUserMessage: async (ctx, id, task, next, prepared, now) => {
    await ctx.db.insert("messages", {
      parentId: id,
      role: "user",
      content: next.content,
      timestamp: now,
      userId: next.userId,
      attachmentStorageIds: next.attachmentStorageIds,
      credentialSourceLabel: await resolveCredentialSourceLabel(
        ctx.db,
        prepared.providerAccountId,
        task.createdBy,
      ),
      model: next.model,
      reasoningLevel: next.reasoningLevel,
      sentViaOrchestrator: next.sentViaOrchestrator,
    });
  },
  startWorkflow: async (ctx, id, task, next, prepared) => {
    const repoId = task.repoId;
    if (!repoId) throw new Error("Task is not associated with a repo");
    return await startQueuedEntityChatTurn(
      ctx,
      {
        entityId: id,
        streamingEntityId: `${TASK_CHAT_STREAM_PREFIX}${String(id)}`,
        next,
        sandboxId: task.sandboxId,
        repoId,
      },
      (turnId) =>
        workflow.start(
          ctx,
          internal.agentTaskChatWorkflow.agentTaskChatExecuteWorkflow,
          {
            taskId: id,
            message: next.content,
            model: next.model ?? DEFAULT_AI_MODEL,
            // Normalised, not forwarded raw: the composer enqueues model defaults
            // explicitly (e.g. reasoning "high"), and the workflow feeds these
            // straight into prewarmEntityDaemon — a raw default yields a different
            // opts sig from the page-open prewarm and kills its daemon.
            ...launchTraitsFromStored(
              normalizeAIModel(next.model ?? DEFAULT_AI_MODEL),
              {
                reasoningLevel: next.reasoningLevel,
                thinkingEnabled: next.thinkingEnabled,
                use1mContext: next.use1mContext,
                fastMode: next.fastMode,
              },
            ),
            providerAccountId: prepared.providerAccountId,
            credentialOwnerUserId: task.createdBy,
            userId: next.userId,
            turnId,
          },
        ),
    );
  },
  onStarted: async (ctx, id, workflowId, now) => {
    await bindOpenTurnWorkflow(ctx, id, workflowId);
    await ctx.db.patch(id, { updatedAt: now });
    await trackAgentTaskChatWorkflow(ctx, id, workflowId, QUEUE_RUN_TIMEOUT_MS);
  },
  recordError: async (ctx, id, content) => {
    await ctx.db.insert("messages", {
      parentId: id,
      role: "assistant",
      content,
      timestamp: Date.now(),
    });
    await ctx.db.patch(id, { updatedAt: Date.now() });
  },
  orchestratorNotifyChild: (task, id) =>
    task.watchedByAve === undefined ? undefined : { kind: "task", taskId: id },
  defaultStartErrorMessage: "Failed to start queued chat message.",
};

/** Dequeues and starts the next pending message for a session, launching its workflow. */
export function startNextQueuedSessionMessage(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<boolean> {
  return startNextQueuedChatMessage(
    ctx,
    sessionId,
    sessionQueueConfig,
    "turn-ended",
  );
}

/** Dequeues and starts the next pending chat message for a project. */
export function startNextQueuedProjectChatMessage(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<boolean> {
  return startNextQueuedChatMessage(
    ctx,
    projectId,
    projectChatQueueConfig,
    "turn-ended",
  );
}

/** Dequeues and starts the next pending chat message for an agent task. */
export function startNextQueuedTaskChatMessage(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  return startNextQueuedChatMessage(
    ctx,
    taskId,
    taskChatQueueConfig,
    "turn-ended",
  );
}

/**
 * A drain that is not a turn ending — sandbox ready, a fresh enqueue, a
 * usage-limit resume, a provider switch. Never wakes a watching orchestrator,
 * and wakes a sleeping sandbox rather than starting a turn on it (see
 * `startNextQueuedChatMessage`).
 */
export async function drainChatQueueQuietly(
  ctx: MutationCtx,
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
): Promise<boolean> {
  const sessionId = ctx.db.normalizeId("sessions", parentId);
  if (sessionId) {
    return startNextQueuedChatMessage(
      ctx,
      sessionId,
      sessionQueueConfig,
      "quiet",
    );
  }
  const taskId = ctx.db.normalizeId("agentTasks", parentId);
  if (taskId) {
    return startNextQueuedChatMessage(
      ctx,
      taskId,
      taskChatQueueConfig,
      "quiet",
    );
  }
  const projectId = ctx.db.normalizeId("projects", parentId);
  if (projectId) {
    return startNextQueuedChatMessage(
      ctx,
      projectId,
      projectChatQueueConfig,
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
 * Retry drain for the releases the surfaces cannot signal themselves: the last
 * backgrounded subagent settling (`scheduleQueueDrainAfterBackgroundAgents`),
 * and a subagent that never settles ageing past the block cap
 * (`scheduleDrainAtBackgroundAgentExpiry`). Every other unblock (turn
 * completion, synthetic-turn completion, cancel, watchdog release) already ends
 * in a drain call. Dispatches on the id's table so all three surfaces share one
 * scheduled function instead of three copies.
 */
export const drainQueueAfterBackgroundAgents = internalMutation({
  args: { parentId: queuedMessageFields.parentId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sessionId = ctx.db.normalizeId("sessions", args.parentId);
    if (sessionId) {
      await startNextQueuedSessionMessage(ctx, sessionId);
      return null;
    }
    const taskId = ctx.db.normalizeId("agentTasks", args.parentId);
    if (taskId) {
      await startNextQueuedTaskChatMessage(ctx, taskId);
      return null;
    }
    const projectId = ctx.db.normalizeId("projects", args.parentId);
    if (projectId) {
      await startNextQueuedProjectChatMessage(ctx, projectId);
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
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
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
