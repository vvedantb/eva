import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { finalizeStaleChatTurn } from "./_chat/stallWatchdog";
import {
  stalledAlert,
  turnAdapterForEntity,
  type AgentTurnOwner,
  type ChatEntityId,
  type ChatSurfaceAdapter,
} from "./_chat/surfaceAdapters";
import {
  tearDownStaleDocWorkflow,
  tearDownStaleEvaluationWorkflow,
  tearDownStaleProjectWorkflow,
  tearDownStaleSessionWorkflow,
} from "./workflowWatchdog";
import { tearDownStaleAutomationRun } from "./_automations/runs";
import { finalizeStalledRun, stalledRunStop } from "./_taskWorkflow/recovery";
import { clearStreamingActivity } from "./_taskWorkflow/helpers";
import { touchStreamingEntity, upsertStreamingActivity } from "./streaming";
import {
  authMutation,
  authQuery,
  hasRepoAccess,
  hasTaskAccess,
} from "./functions";
import {
  acquireTurnLease,
  advanceTurn,
  bindTurnWorkflow,
  closeTurn,
  findOpenTurn,
  graceExpiredTurnLease,
  openTurn,
  renewTurnLease,
  type ChatTurnEntityId,
} from "./_chat/turnStore";
import {
  expiredTurnLeaseDecision,
  turnLeaseDurationMs,
  type ExpiredTurnLeaseCause,
} from "./_chat/turnLease";
import type { ChatAlert } from "./_chat/surfaceAdapters";
import {
  chatTurnEntityIdValidator,
  turnEntityIdValidator,
  turnLaneValidator,
  turnStateValidator,
} from "./_validators/tableFields";
import { normalizeAIModel } from "./_validators/aiModels";
import {
  isLegacyChatExecuting,
  isLegacySessionExecuting,
} from "./_chat/turnProjection";

const chatTurnStatusValidator = v.union(
  v.object({
    source: v.literal("durable"),
    turnId: v.id("turns"),
    state: turnStateValidator,
    startedAt: v.number(),
    leaseExpiresAt: v.number(),
    placeholderMessageId: v.optional(v.id("messages")),
  }),
  v.object({ source: v.literal("legacy") }),
);
type ChatTurnStatus = Infer<typeof chatTurnStatusValidator>;

/**
 * Whether one chat has a turn open, for a reader who may see it. The open
 * durable turn is canonical, synthetic turns included. Entities that never
 * opened one fall back to their workflow fields until the lifecycle marker
 * (`turnLifecycleVersion` / `chatTurnLifecycleVersion`) says otherwise.
 */
async function readChatStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
  entityId: ChatTurnEntityId,
): Promise<ChatTurnStatus | null> {
  const legacyExecuting = await readLegacyExecuting(ctx, userId, entityId);
  if (legacyExecuting === null) return null;
  const turn = await findOpenTurn(ctx, entityId);
  if (!turn) return legacyExecuting ? { source: "legacy" } : null;
  return {
    source: "durable",
    turnId: turn._id,
    state: turn.state,
    startedAt: turn.turnStartedAt,
    leaseExpiresAt: turn.leaseExpiresAt,
    placeholderMessageId: turn.placeholderMessageId,
  };
}

/** The legacy bridge for one entity; null when the reader may not see it. */
async function readLegacyExecuting(
  ctx: QueryCtx,
  userId: Id<"users">,
  entityId: ChatTurnEntityId,
): Promise<boolean | null> {
  const sessionId = ctx.db.normalizeId("sessions", entityId);
  if (sessionId) {
    const session = await ctx.db.get(sessionId);
    if (!session || !(await hasRepoAccess(ctx.db, session.repoId, userId))) {
      return null;
    }
    return isLegacySessionExecuting(session);
  }
  const taskId = ctx.db.normalizeId("agentTasks", entityId);
  if (taskId) {
    const task = await ctx.db.get(taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, userId))) return null;
    return isLegacyChatExecuting(task);
  }
  const projectId = ctx.db.normalizeId("projects", entityId);
  if (!projectId) return null;
  const project = await ctx.db.get(projectId);
  if (!project || !(await hasRepoAccess(ctx.db, project.repoId, userId))) {
    return null;
  }
  return isLegacyChatExecuting(project);
}

/** Canonical UI projection for whether one chat (session, task or project) has a turn open. */
export const getChatStatus = authQuery({
  args: { entityId: chatTurnEntityIdValidator },
  returns: v.union(chatTurnStatusValidator, v.null()),
  handler: async (ctx, args): Promise<ChatTurnStatus | null> =>
    await readChatStatus(ctx, ctx.userId, args.entityId),
});

/** Session form of {@link getChatStatus}, kept for the session UI. */
export const getSessionStatus = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(chatTurnStatusValidator, v.null()),
  handler: async (ctx, args): Promise<ChatTurnStatus | null> =>
    await readChatStatus(ctx, ctx.userId, args.sessionId),
});

const leaseIdentityValidator = v.object({
  turnId: v.id("turns"),
  leaseGeneration: v.number(),
});

const leaseVerdictValidator = v.union(
  v.object({
    status: v.literal("renewed"),
    leaseExpiresAt: v.number(),
    durationMs: v.number(),
  }),
  v.object({
    status: v.literal("terminal"),
    reason: v.union(
      v.literal("unknown_turn"),
      v.literal("closed"),
      v.literal("superseded"),
      v.literal("timeout"),
      v.literal("cancelled"),
    ),
  }),
);

const heartbeatArgs = {
  turnId: v.string(),
  leaseGeneration: v.number(),
  entityId: v.string(),
  touchOnly: v.boolean(),
  currentActivity: v.optional(v.string()),
  currentContent: v.optional(v.string()),
  pendingQuestion: v.optional(v.string()),
};
const heartbeatArgsValidator = v.object(heartbeatArgs);

async function applyFencedHeartbeat(
  ctx: MutationCtx,
  args: Infer<typeof heartbeatArgsValidator>,
) {
  const lease = await renewTurnLease(ctx, {
    turnId: args.turnId,
    leaseGeneration: args.leaseGeneration,
    streamingEntityId: args.entityId,
  });
  if (lease.status === "terminal") return lease;
  if (args.touchOnly) {
    await touchStreamingEntity(ctx, args.entityId);
  } else {
    await upsertStreamingActivity(ctx, {
      entityId: args.entityId,
      currentActivity: args.currentActivity ?? "[]",
      currentContent: args.currentContent,
      pendingQuestion: args.pendingQuestion,
    });
  }
  return lease;
}

/** Renews the exact lease generation presented by a sandbox runner. */
export const renew = internalMutation({
  args: {
    turnId: v.string(),
    leaseGeneration: v.number(),
    streamingEntityId: v.optional(v.string()),
  },
  returns: leaseVerdictValidator,
  handler: async (ctx, args) => await renewTurnLease(ctx, args),
});

/** Atomically renews a fenced lease and writes only for its current owner. */
export const heartbeat = internalMutation({
  args: heartbeatArgs,
  returns: leaseVerdictValidator,
  handler: applyFencedHeartbeat,
});

/** Authenticated fallback for callbacks without the scoped heartbeat route. */
export const heartbeatFromCallback = authMutation({
  args: heartbeatArgs,
  returns: v.object({ lease: leaseVerdictValidator }),
  handler: async (ctx, args) => ({
    lease: await applyFencedHeartbeat(ctx, args),
  }),
});

/** Records that durable sandbox preparation has reached the launch phase. */
export const markLaunching = internalMutation({
  args: {
    turnId: v.id("turns"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (turn) await advanceTurn(ctx, turn, "launching", args);
    return null;
  },
});

/**
 * Opens a one-shot agent's turn already leased: the launch that follows starts
 * the process that owns it. Binds the calling workflow so the reconciler can
 * tear that workflow down if the agent stalls.
 */
export const openAgentTurnLease = internalMutation({
  args: {
    entityId: turnEntityIdValidator,
    lane: v.optional(turnLaneValidator),
    streamingEntityId: v.string(),
    model: v.optional(v.string()),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    workflowId: v.string(),
  },
  returns: leaseIdentityValidator,
  handler: async (ctx, args) => {
    const turnId = await openTurn(ctx, {
      entityId: args.entityId,
      lane: args.lane,
      streamingEntityId: args.streamingEntityId,
      model: normalizeAIModel(args.model),
      sandboxId: args.sandboxId,
      repoId: args.repoId,
    });
    await bindTurnWorkflow(ctx, turnId, args.workflowId);
    const turn = await ctx.db.get(turnId);
    const lease = turn
      ? await acquireTurnLease(ctx, turn, "running", {
          sandboxId: args.sandboxId,
        })
      : null;
    if (!lease) throw new Error("Agent turn lease was not acquired");
    return lease;
  },
});

/** Closes one agent turn, e.g. when its process failed to launch. */
export const closeAgentTurn = internalMutation({
  args: { turnId: v.id("turns"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (turn) await closeTurn(ctx, turn, "error", { error: args.error });
    return null;
  },
});

/** Gives a one-shot runner its fenced lease immediately before process launch. */
export const acquireOneShotLease = internalMutation({
  args: {
    turnId: v.id("turns"),
    sandboxId: v.string(),
  },
  returns: v.union(leaseIdentityValidator, v.null()),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn) return null;
    return await acquireTurnLease(ctx, turn, "running", args);
  },
});

/**
 * Appends why the reconciler gave up to the shared stall alert. The shared
 * wording assumes a dead process; a turn finalised after grace expired needs
 * to say the process was alive but mute, or the user reads a wrong cause.
 */
function withCauseDetail(
  alert: ChatAlert,
  cause: ExpiredTurnLeaseCause,
  silentSince: number,
): ChatAlert {
  if (cause === "sandbox_stopped") return alert;
  const suffix =
    cause === "silent_timeout"
      ? ` The agent process was still running but sent no heartbeat for ${Math.round((Date.now() - silentSince) / 1000)}s, so Eva stopped waiting.`
      : " The agent process is no longer running in the sandbox.";
  return { text: alert.text, detail: `${alert.detail ?? ""}${suffix}` };
}

/** Open turns whose owner lease has expired. */
export const listExpired = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(
    v.object({
      turnId: v.id("turns"),
      sandboxId: v.optional(v.string()),
      repoId: v.id("githubRepos"),
      silentSince: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const turns = await ctx.db
      .query("turns")
      .withIndex("by_open_lease", (q) =>
        q.eq("open", true).lt("leaseExpiresAt", args.now),
      )
      .take(args.limit);
    return turns.map((turn) => ({
      turnId: turn._id,
      sandboxId: turn.sandboxId,
      repoId: turn.repoId,
      silentSince: turn.silentSince,
    }));
  },
});

/**
 * Extends one expired lease whose sandbox process is still demonstrably alive.
 * A concurrent renewal always wins, exactly as in `finalizeExpired`.
 */
export const graceExpired = internalMutation({
  args: { turnId: v.id("turns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn || !turn.open || turn.leaseExpiresAt >= Date.now()) return null;
    await graceExpiredTurnLease(ctx, turn, Date.now());
    return null;
  },
});

/**
 * Finalises one expired turn for any chat surface. A turn with a workflow
 * gets the full stale-turn teardown; a turn without one (a synthetic turn)
 * only closes its placeholder and frees the entity's synthetic slot.
 */
async function finalizeExpiredChatTurn<TId extends ChatEntityId, TEntity>(
  ctx: MutationCtx,
  adapter: ChatSurfaceAdapter<TId, TEntity>,
  id: TId,
  turn: Doc<"turns">,
  cause: ExpiredTurnLeaseCause,
): Promise<void> {
  const sandboxStopped = cause === "sandbox_stopped";
  const entity = await adapter.getEntity(ctx, id);
  const leaseDurationMs = turnLeaseDurationMs(turn.state);
  const lastLeaseWriteAt = turn.leaseExpiresAt - leaseDurationMs;
  const staleSeconds = Math.max(
    1,
    Math.round((Date.now() - lastLeaseWriteAt) / 1000),
  );
  const thresholdSeconds = Math.max(1, Math.round(leaseDurationMs / 1000));
  const alert = sandboxStopped
    ? adapter.alerts.sandboxStopped(staleSeconds)
    : withCauseDetail(
        adapter.alerts.stalled(staleSeconds, turn.state, thresholdSeconds),
        cause,
        turn.silentSince ?? lastLeaseWriteAt,
      );
  if (entity && turn.workflowId !== undefined) {
    await finalizeStaleChatTurn(
      ctx,
      adapter,
      id,
      entity,
      turn.workflowId,
      alert,
      { sandboxStopped },
    );
  } else if (entity && turn.placeholderMessageId !== undefined) {
    const message = await ctx.db.get(turn.placeholderMessageId);
    if (message && message.finishedAt === undefined) {
      await ctx.db.patch(message._id, {
        content: alert.text,
        finishedAt: Date.now(),
      });
    }
    await clearStreamingActivity(ctx, turn.streamingEntityId);
    await adapter.finalizeOrphanTurn(ctx, id);
    await adapter.drainQueue(ctx, id);
  }
  await closeTurn(ctx, turn, "error", { error: alert.text });
  if (!sandboxStopped) {
    await adapter.afterStallFinalize(ctx, id, turn._id);
  }
}

/**
 * Finalises one expired agent turn (a quick-task run or a one-shot agent)
 * through that agent's own stall teardown: the run's `cleanUpStaleRun`, or the
 * teardown the 2-hour backstop uses for the others.
 */
async function finalizeExpiredAgentTurn(
  ctx: MutationCtx,
  owner: AgentTurnOwner,
  turn: Doc<"turns">,
  cause: ExpiredTurnLeaseCause,
): Promise<void> {
  const leaseDurationMs = turnLeaseDurationMs(turn.state);
  const staleSeconds = Math.max(
    1,
    Math.round((Date.now() - (turn.leaseExpiresAt - leaseDurationMs)) / 1000),
  );
  const error = `Agent stalled: no heartbeat for ${staleSeconds}s (${cause})`;
  console.log(
    `[watchdog][lease-reconcile] agent=${owner.kind} id=${owner.id} turnId=${turn._id} cause=${cause}`,
  );
  const workflowId = turn.workflowId;
  switch (owner.kind) {
    case "run":
      await finalizeStalledRun(ctx, owner.id, {
        ...stalledRunStop({
          state: turn.state,
          hasSandbox: turn.sandboxId !== undefined,
          staleSeconds,
        }),
        sandboxId: turn.sandboxId,
      });
      break;
    case "automation":
      if (workflowId !== undefined) {
        await tearDownStaleAutomationRun(
          ctx,
          owner.id,
          workflowId,
          { sandboxId: turn.sandboxId, repoId: turn.repoId },
          error,
        );
      }
      break;
    case "doc":
      if (workflowId !== undefined) {
        await tearDownStaleDocWorkflow(ctx, owner.id, workflowId);
      }
      break;
    case "evaluation":
      if (workflowId !== undefined) {
        await tearDownStaleEvaluationWorkflow(ctx, owner.id, workflowId);
      }
      break;
    case "summary":
      if (workflowId !== undefined) {
        await tearDownStaleSessionWorkflow(
          ctx,
          owner.id,
          workflowId,
          stalledAlert(
            staleSeconds,
            turn.state,
            Math.round(leaseDurationMs / 1000),
          ),
        );
      }
      break;
    case "interview":
      if (workflowId !== undefined) {
        await tearDownStaleProjectWorkflow(ctx, owner.id, workflowId);
      }
      break;
  }
  await clearStreamingActivity(ctx, turn.streamingEntityId);
  await closeTurn(ctx, turn, "error", { error });
}

/** Re-reads and converges one expired lease; a concurrent renewal always wins. */
export const finalizeExpired = internalMutation({
  args: {
    turnId: v.id("turns"),
    cause: v.union(
      v.literal("sandbox_stopped"),
      v.literal("process_dead"),
      v.literal("silent_timeout"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn || !turn.open || turn.leaseExpiresAt >= Date.now()) return null;
    await turnAdapterForEntity(ctx.db, turn, {
      chat: (adapter, id) =>
        finalizeExpiredChatTurn(ctx, adapter, id, turn, args.cause),
      agent: (owner) => finalizeExpiredAgentTurn(ctx, owner, turn, args.cause),
    });
    return null;
  },
});

const RECONCILE_BATCH_SIZE = 25;

/**
 * Level-triggered convergence for owners that stop renewing their lease.
 *
 * An expired lease is not proof the run is gone: a daemon whose VM swaps hard
 * can freeze for minutes and then recover. So the probe verdict now decides the
 * action, not just the alert wording — a process the sandbox still reports
 * running is granted grace (`graceExpired`), bounded by
 * `TURN_SILENT_ALIVE_GRACE_MS` from the first silent cycle. A stopped sandbox
 * or a dead process is finalised immediately, and a still-running sandbox has
 * its post-mortem captured first so the stall can be root-caused later.
 */
export const reconcile = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.runQuery(internal.turns.listExpired, {
      now: Date.now(),
      limit: RECONCILE_BATCH_SIZE,
    });
    for (const turn of expired) {
      const liveness = turn.sandboxId
        ? await ctx.runAction(internal.sandbox.verifySandboxLiveness, {
            sandboxId: turn.sandboxId,
            repoId: turn.repoId,
          })
        : null;
      const decision = expiredTurnLeaseDecision({
        liveness,
        silentSince: turn.silentSince,
        now: Date.now(),
      });
      console.log(
        `[watchdog][lease-reconcile] turnId=${turn.turnId} sandboxId=${turn.sandboxId ?? "none"} alive=${liveness?.alive ?? "n/a"} reason=${liveness?.reason ?? "no_sandbox"} silentSince=${turn.silentSince ?? "none"} decision=${decision.action === "grace" ? "grace" : `finalize:${decision.cause}`}`,
      );
      if (decision.action === "grace") {
        await ctx.runMutation(internal.turns.graceExpired, {
          turnId: turn.turnId,
        });
        continue;
      }
      // Evidence must be read while the VM is still up, but never at the cost
      // of leaving the turn open — a failed capture is only logged.
      if (decision.cause !== "sandbox_stopped" && turn.sandboxId) {
        try {
          const diagnostics = await ctx.runAction(
            internal.sandbox.captureStalledTurnDiagnostics,
            { sandboxId: turn.sandboxId, repoId: turn.repoId },
          );
          console.log(
            `[watchdog][lease-diagnostics] turnId=${turn.turnId} sandboxId=${turn.sandboxId}\n${diagnostics}`,
          );
        } catch (error) {
          console.log(
            `[watchdog][lease-diagnostics] turnId=${turn.turnId} capture failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      await ctx.runMutation(internal.turns.finalizeExpired, {
        turnId: turn.turnId,
        cause: decision.cause,
      });
    }
    return null;
  },
});
