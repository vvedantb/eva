import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { finalizeStaleChatTurn } from "./_chat/stallWatchdog";
import { sessionChatAdapter } from "./_chat/surfaceAdapters";
import { clearStreamingActivity } from "./_taskWorkflow/helpers";
import { drainSessionChatQueues } from "./_queues/helpers";
import {
  touchStreamingEntity,
  upsertStreamingActivity,
} from "./streaming";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import {
  acquireTurnLease,
  advanceTurn,
  closeTurn,
  findOpenChatTurn,
  listOpenSessionTurns,
  renewTurnLease,
} from "./_chat/turnStore";
import { turnLeaseDurationMs } from "./_chat/turnLease";
import { turnStateValidator } from "./_validators/tableFields";
import { loadSessionChat } from "./_sessionChats/helpers";

const chatTurnStatusValidator = v.object({
  turnId: v.id("turns"),
  state: turnStateValidator,
  startedAt: v.number(),
  leaseExpiresAt: v.number(),
  placeholderMessageId: v.optional(v.id("messages")),
});

/** Canonical UI projection for whether one chat's turn is open. */
export const getChatStatus = authQuery({
  args: { chatId: v.id("sessionChats") },
  returns: v.union(chatTurnStatusValidator, v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof chatTurnStatusValidator> | null> => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return null;
    if (!(await hasRepoAccess(ctx.db, chat.repoId, ctx.userId))) return null;
    const turn = await findOpenChatTurn(ctx, args.chatId);
    if (!turn) return null;
    return {
      turnId: turn._id,
      state: turn.state,
      startedAt: turn.turnStartedAt,
      leaseExpiresAt: turn.leaseExpiresAt,
      placeholderMessageId: turn.placeholderMessageId,
    };
  },
});

/**
 * Open turns across every chat of a session, in one indexed read. Feeds the
 * chat tab strip's running dots and the "waiting for a free slot" caption.
 */
export const listSessionChatStatuses = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(
    v.object({
      chatId: v.id("sessionChats"),
      state: turnStateValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return [];
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return [];
    const turns = await listOpenSessionTurns(ctx, args.sessionId);
    const statuses: Array<{
      chatId: Id<"sessionChats">;
      state: Infer<typeof turnStateValidator>;
    }> = [];
    for (const turn of turns) {
      const chatId = ctx.db.normalizeId("sessionChats", turn.entityId);
      if (chatId) statuses.push({ chatId, state: turn.state });
    }
    return statuses;
  },
});

/**
 * Chat ids with an open turn across a repo, for the sidebar's indented chat
 * rows: one indexed scan per repo group instead of a status query per session.
 */
export const listRunningChatIdsForRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(v.id("sessionChats")),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const turns = await ctx.db
      .query("turns")
      .withIndex("by_repo_open", (q) =>
        q.eq("repoId", args.repoId).eq("open", true),
      )
      .collect();
    const chatIds: Id<"sessionChats">[] = [];
    for (const turn of turns) {
      const chatId = ctx.db.normalizeId("sessionChats", turn.entityId);
      if (chatId) chatIds.push(chatId);
    }
    return chatIds;
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
  const chatId = ctx.db.normalizeId("sessionChats", args.entityId);
  if (chatId && (await findOpenChatTurn(ctx, chatId))) return false;
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

/** Legacy callbacks may write only while no durable Turn owns the chat. */
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

/** Open turns whose owner lease has expired. */
export const listExpired = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(
    v.object({
      turnId: v.id("turns"),
      sandboxId: v.optional(v.string()),
      repoId: v.id("githubRepos"),
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
    }));
  },
});

/** Re-reads and converges one expired lease; a concurrent renewal always wins. */
export const finalizeExpired = internalMutation({
  args: {
    turnId: v.id("turns"),
    sandboxStopped: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn || !turn.open || turn.leaseExpiresAt >= Date.now()) return null;
    const chatId = ctx.db.normalizeId("sessionChats", turn.entityId);
    const context = chatId ? await loadSessionChat(ctx.db, chatId) : null;
    const leaseDurationMs = turnLeaseDurationMs(turn.state);
    const lastLeaseWriteAt = turn.leaseExpiresAt - leaseDurationMs;
    const staleSeconds = Math.max(
      1,
      Math.round((Date.now() - lastLeaseWriteAt) / 1000),
    );
    const thresholdSeconds = Math.max(1, Math.round(leaseDurationMs / 1000));
    const alert = args.sandboxStopped
      ? sessionChatAdapter.alerts.sandboxStopped(staleSeconds)
      : sessionChatAdapter.alerts.stalled(
          staleSeconds,
          turn.state,
          thresholdSeconds,
        );
    if (chatId && context && turn.workflowId !== undefined) {
      await finalizeStaleChatTurn(
        ctx,
        sessionChatAdapter,
        chatId,
        context,
        turn.workflowId,
        alert,
        { sandboxStopped: args.sandboxStopped },
      );
    } else if (chatId && context && turn.placeholderMessageId !== undefined) {
      const message = await ctx.db.get(turn.placeholderMessageId);
      if (message && message.finishedAt === undefined) {
        await ctx.db.patch(message._id, {
          content: alert.text,
          finishedAt: Date.now(),
        });
      }
      await clearStreamingActivity(ctx, turn.streamingEntityId);
      await ctx.db.patch(chatId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      await drainSessionChatQueues(ctx, context.session._id, chatId);
    } else {
      // A pre-chat "session" turn or an orphan: nothing to salvage into.
      await clearStreamingActivity(ctx, turn.streamingEntityId);
    }
    await closeTurn(ctx, turn, "error", { error: alert.text });
    if (chatId && context && !args.sandboxStopped) {
      await ctx.scheduler.runAfter(
        0,
        internal._sessions.execution.retryEmptyStalledSessionTurn,
        {
          chatId,
          turnId: args.turnId,
          sandboxStopped: args.sandboxStopped,
        },
      );
    }
    return null;
  },
});

const RECONCILE_BATCH_SIZE = 25;

/** Level-triggered convergence for owners that die without sending completion. */
export const reconcile = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.runQuery(internal.turns.listExpired, {
      now: Date.now(),
      limit: RECONCILE_BATCH_SIZE,
    });
    for (const turn of expired) {
      let sandboxStopped = false;
      if (turn.sandboxId) {
        const liveness = await ctx.runAction(
          internal.sandbox.verifySandboxLiveness,
          {
            sandboxId: turn.sandboxId,
            repoId: turn.repoId,
          },
        );
        sandboxStopped = liveness.reason === "sandbox_not_started";
      }
      await ctx.runMutation(internal.turns.finalizeExpired, {
        turnId: turn.turnId,
        sandboxStopped,
      });
    }
    return null;
  },
});
