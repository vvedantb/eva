import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { finalizeStaleChatTurn } from "./_chat/stallWatchdog";
import { sessionChatAdapter } from "./_chat/surfaceAdapters";
import { clearStreamingActivity } from "./_taskWorkflow/helpers";
import { startNextQueuedSessionMessage } from "./_queues/helpers";
import {
  touchStreamingEntity,
  upsertStreamingActivity,
} from "./streaming";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import {
  acquireTurnLease,
  advanceTurn,
  closeTurn,
  findOpenSessionTurn,
  graceExpiredTurnLease,
  renewTurnLease,
} from "./_chat/turnStore";
import {
  expiredTurnLeaseDecision,
  turnLeaseDurationMs,
  type ExpiredTurnLeaseCause,
} from "./_chat/turnLease";
import type { ChatAlert } from "./_chat/surfaceAdapters";
import { turnStateValidator } from "./_validators/tableFields";
import { isLegacySessionExecuting } from "./_chat/turnProjection";

const sessionTurnStatusValidator = v.union(
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

/** Canonical UI projection for whether one session turn is open. */
export const getSessionStatus = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(sessionTurnStatusValidator, v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof sessionTurnStatusValidator> | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    const turn = await findOpenSessionTurn(ctx, args.sessionId);
    if (!turn) {
      return isLegacySessionExecuting(session) ? { source: "legacy" } : null;
    }
    return {
      source: "durable",
      turnId: turn._id,
      state: turn.state,
      startedAt: turn.turnStartedAt,
      leaseExpiresAt: turn.leaseExpiresAt,
      placeholderMessageId: turn.placeholderMessageId,
    };
  },
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

const legacyHeartbeatArgs = {
  entityId: v.string(),
  touchOnly: v.boolean(),
  currentActivity: v.optional(v.string()),
  currentContent: v.optional(v.string()),
  pendingQuestion: v.optional(v.string()),
};
const legacyHeartbeatArgsValidator = v.object(legacyHeartbeatArgs);

async function applyLegacyHeartbeat(
  ctx: MutationCtx,
  args: Infer<typeof legacyHeartbeatArgsValidator>,
): Promise<boolean> {
  const sessionId = ctx.db.normalizeId("sessions", args.entityId);
  if (sessionId && (await findOpenSessionTurn(ctx, sessionId))) return false;
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
  return true;
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

/** Legacy callbacks may write only while no durable Turn owns the session. */
export const legacyHeartbeat = internalMutation({
  args: legacyHeartbeatArgs,
  returns: v.boolean(),
  handler: applyLegacyHeartbeat,
});

/** Authenticated legacy fallback with the same durable ownership gate. */
const legacyHeartbeatResultValidator = v.object({
  accepted: v.boolean(),
  lease: v.union(leaseVerdictValidator, v.null()),
});

export const legacyHeartbeatFromCallback = authMutation({
  args: legacyHeartbeatArgs,
  returns: legacyHeartbeatResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof legacyHeartbeatResultValidator>> => {
    const accepted = await applyLegacyHeartbeat(ctx, args);
    return {
      accepted,
      lease: accepted
        ? null
        : { status: "terminal", reason: "superseded" },
    };
  },
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
    const sandboxStopped = args.cause === "sandbox_stopped";
    const sessionId = ctx.db.normalizeId("sessions", turn.entityId);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    const leaseDurationMs = turnLeaseDurationMs(turn.state);
    const lastLeaseWriteAt = turn.leaseExpiresAt - leaseDurationMs;
    const staleSeconds = Math.max(
      1,
      Math.round((Date.now() - lastLeaseWriteAt) / 1000),
    );
    const thresholdSeconds = Math.max(1, Math.round(leaseDurationMs / 1000));
    const alert = sandboxStopped
      ? sessionChatAdapter.alerts.sandboxStopped(staleSeconds)
      : withCauseDetail(
          sessionChatAdapter.alerts.stalled(
            staleSeconds,
            turn.state,
            thresholdSeconds,
          ),
          args.cause,
          turn.silentSince ?? lastLeaseWriteAt,
        );
    if (sessionId && session && turn.workflowId !== undefined) {
      await finalizeStaleChatTurn(
        ctx,
        sessionChatAdapter,
        sessionId,
        session,
        turn.workflowId,
        alert,
        { sandboxStopped },
      );
    } else if (sessionId && session && turn.placeholderMessageId !== undefined) {
      const message = await ctx.db.get(turn.placeholderMessageId);
      if (message && message.finishedAt === undefined) {
        await ctx.db.patch(message._id, {
          content: alert.text,
          finishedAt: Date.now(),
        });
      }
      await clearStreamingActivity(ctx, turn.streamingEntityId);
      await ctx.db.patch(sessionId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      await startNextQueuedSessionMessage(ctx, sessionId);
    }
    await closeTurn(ctx, turn, "error", { error: alert.text });
    if (sessionId && !sandboxStopped) {
      await ctx.scheduler.runAfter(
        0,
        internal._sessions.execution.retryEmptyStalledSessionTurn,
        {
          sessionId,
          turnId: args.turnId,
          sandboxStopped,
        },
      );
    }
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
