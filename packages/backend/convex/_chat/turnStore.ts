import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { TurnState } from "../validators";
import {
  canTransitionTurn,
  isTerminalTurnState,
  turnExceededAbsoluteLimit,
  shouldWriteTurnLeaseRenewal,
  turnLeaseDurationMs,
  turnLeaseExpiry,
  type TerminalTurnState,
} from "./turnLease";
import {
  activityRefForParentId,
  touchAgentFinished,
} from "../_sandbox/activity";

export type TurnLeaseIdentity = {
  turnId: Id<"turns">;
  leaseGeneration: number;
};

export type TurnLeaseVerdict =
  | {
      status: "renewed";
      leaseExpiresAt: number;
      durationMs: number;
    }
  | {
      status: "terminal";
      reason:
        | "unknown_turn"
        | "closed"
        | "superseded"
        | "timeout"
        | "cancelled";
    };

export type CompletionTurnResolution =
  | { status: "current"; turn: Doc<"turns"> }
  | { status: "legacy" }
  | { status: "stale" };

/** Chat entities that own durable turns. The id's table picks the surface. */
export type ChatTurnEntityId = Doc<"turns">["entityId"];

export async function findOpenTurn(
  ctx: QueryCtx,
  entityId: ChatTurnEntityId,
): Promise<Doc<"turns"> | null> {
  return await ctx.db
    .query("turns")
    .withIndex("by_entity_open", (q) =>
      q.eq("entityId", entityId).eq("open", true),
    )
    .first();
}

export async function findOpenSessionTurn(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
): Promise<Doc<"turns"> | null> {
  return await findOpenTurn(ctx, sessionId);
}

type OpenTurnFields = {
  streamingEntityId: string;
  placeholderMessageId: Id<"messages">;
  prompt: string;
  attachmentStorageIds?: Id<"_storage">[];
  model: Doc<"turns">["model"];
  sandboxId?: string;
  repoId: Id<"githubRepos">;
};

/** Opens a durable turn and supersedes any turn the entity still has open. */
export async function openTurn(
  ctx: MutationCtx,
  params: OpenTurnFields & { entityId: ChatTurnEntityId },
): Promise<Id<"turns">> {
  const now = Date.now();
  const previous = await findOpenTurn(ctx, params.entityId);
  if (previous) {
    await closeTurn(ctx, previous, "cancelled", {
      error: "Superseded by a newer turn",
    });
  }
  return await ctx.db.insert("turns", {
    entityId: params.entityId,
    streamingEntityId: params.streamingEntityId,
    state: "staged",
    open: true,
    turnStartedAt: now,
    leaseExpiresAt: turnLeaseExpiry({
      state: "staged",
      turnStartedAt: now,
      now,
    }),
    leaseGeneration: 0,
    placeholderMessageId: params.placeholderMessageId,
    prompt: params.prompt,
    attachmentStorageIds: params.attachmentStorageIds,
    model: params.model,
    sandboxId: params.sandboxId,
    repoId: params.repoId,
  });
}

export async function openSessionTurn(
  ctx: MutationCtx,
  params: OpenTurnFields & { sessionId: Id<"sessions"> },
): Promise<Id<"turns">> {
  const { sessionId, ...turn } = params;
  const turnId = await openTurn(ctx, { ...turn, entityId: sessionId });
  await ctx.db.patch(sessionId, { turnLifecycleVersion: 2 });
  return turnId;
}

/**
 * Opens a task-chat or project-chat turn and marks the entity as a durable-turn
 * user (`chatTurnLifecycleVersion`), as `openSessionTurn` does for sessions.
 */
export async function openChatTurn(
  ctx: MutationCtx,
  params: OpenTurnFields & { entityId: Id<"agentTasks"> | Id<"projects"> },
): Promise<Id<"turns">> {
  const turnId = await openTurn(ctx, params);
  await ctx.db.patch(params.entityId, { chatTurnLifecycleVersion: 2 });
  return turnId;
}

/**
 * Leases a just-opened daemon-minted (synthetic) turn: the daemon that asked
 * for it is already running, so it owns the lease from the first heartbeat.
 */
export async function leaseSyntheticTurn(
  ctx: MutationCtx,
  turnId: Id<"turns">,
): Promise<TurnLeaseIdentity> {
  const turn = await ctx.db.get(turnId);
  if (!turn) throw new Error("Synthetic turn was not created");
  const lease = await acquireTurnLease(ctx, turn, "running");
  if (!lease) throw new Error("Synthetic turn lease was not acquired");
  return lease;
}

/**
 * The durable side of a daemon claim for a staged turn. `drop`: the turn is
 * closed or another daemon already runs it, so the caller clears the stale
 * `pendingTurn`. `busy`: the turn cannot take a lease now; leave it staged.
 */
export async function claimStagedTurn(
  ctx: MutationCtx,
  turnId: Id<"turns">,
): Promise<
  | { status: "leased"; lease: TurnLeaseIdentity }
  | { status: "drop" }
  | { status: "busy" }
> {
  const turn = await ctx.db.get(turnId);
  if (!turn || !turn.open || turn.state === "running") {
    return { status: "drop" };
  }
  const lease = await acquireTurnLease(ctx, turn, "running");
  return lease === null ? { status: "busy" } : { status: "leased", lease };
}

export async function bindTurnWorkflow(
  ctx: MutationCtx,
  turnId: Id<"turns">,
  workflowId: string,
): Promise<void> {
  const turn = await ctx.db.get(turnId);
  if (!turn || !turn.open) return;
  await ctx.db.patch(turnId, { workflowId });
}

export async function advanceTurn(
  ctx: MutationCtx,
  turn: Doc<"turns">,
  state: Exclude<TurnState, TerminalTurnState>,
  patch: { sandboxId?: string } = {},
): Promise<void> {
  if (!turn.open || !canTransitionTurn(turn.state, state)) return;
  const now = Date.now();
  await ctx.db.patch(turn._id, {
    state,
    leaseExpiresAt: turnLeaseExpiry({
      state,
      turnStartedAt: turn.turnStartedAt,
      now,
    }),
    ...(patch.sandboxId !== undefined ? { sandboxId: patch.sandboxId } : {}),
  });
}

export async function acquireTurnLease(
  ctx: MutationCtx,
  turn: Doc<"turns">,
  state: "launching" | "running",
  patch: { sandboxId?: string } = {},
): Promise<TurnLeaseIdentity | null> {
  if (!turn.open || !canTransitionTurn(turn.state, state)) return null;
  const leaseGeneration = turn.leaseGeneration + 1;
  const now = Date.now();
  await ctx.db.patch(turn._id, {
    state,
    leaseGeneration,
    leaseExpiresAt: turnLeaseExpiry({
      state,
      turnStartedAt: turn.turnStartedAt,
      now,
    }),
    ...(patch.sandboxId !== undefined ? { sandboxId: patch.sandboxId } : {}),
  });
  return { turnId: turn._id, leaseGeneration };
}

export async function renewTurnLease(
  ctx: MutationCtx,
  params: {
    turnId: string;
    leaseGeneration: number;
    streamingEntityId?: string;
  },
): Promise<TurnLeaseVerdict> {
  const turnId = ctx.db.normalizeId("turns", params.turnId);
  if (!turnId) return { status: "terminal", reason: "unknown_turn" };
  const turn = await ctx.db.get(turnId);
  if (!turn) return { status: "terminal", reason: "unknown_turn" };
  if (!turn.open || isTerminalTurnState(turn.state)) {
    return {
      status: "terminal",
      reason: turn.state === "cancelled" ? "cancelled" : "closed",
    };
  }
  if (
    params.streamingEntityId !== undefined &&
    params.streamingEntityId !== turn.streamingEntityId
  ) {
    return { status: "terminal", reason: "unknown_turn" };
  }
  if (turn.leaseGeneration !== params.leaseGeneration) {
    return { status: "terminal", reason: "superseded" };
  }
  const current = await findOpenTurn(ctx, turn.entityId);
  if (!current || current._id !== turn._id) {
    return { status: "terminal", reason: "superseded" };
  }
  const now = Date.now();
  if (turnExceededAbsoluteLimit(turn.turnStartedAt, now)) {
    await closeTurn(ctx, turn, "error", {
      error: "Turn exceeded the 2-hour limit",
    });
    return { status: "terminal", reason: "timeout" };
  }
  const state = turn.state === "finalizing" ? "finalizing" : "running";
  const durationMs = turnLeaseDurationMs(state);
  // A turn the reconciler marked silent must always write, even when the
  // renewal-throttle would skip it: the write is what clears `silentSince`,
  // and without it a recovered daemon stays on the grace clock.
  if (
    turn.silentSince === undefined &&
    !shouldWriteTurnLeaseRenewal({
      currentState: turn.state,
      nextState: state,
      leaseExpiresAt: turn.leaseExpiresAt,
      now,
      durationMs,
    })
  ) {
    return {
      status: "renewed",
      leaseExpiresAt: turn.leaseExpiresAt,
      durationMs,
    };
  }
  const leaseExpiresAt = turnLeaseExpiry({
    state,
    turnStartedAt: turn.turnStartedAt,
    now,
  });
  await ctx.db.patch(turn._id, {
    state,
    leaseExpiresAt,
    silentSince: undefined,
  });
  // A live turn keeps the sandbox's hard runtime cap ahead of it, or the
  // provider kills it mid-work with no snapshot. Only on a written renewal
  // (the throttle above), so at most once per half lease; two lease lengths
  // keep the deadline ahead through a delayed renewal.
  if (turn.sandboxId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.sandbox.extendSandboxDeadline, {
      sandboxId: turn.sandboxId,
      repoId: turn.repoId,
      durationMs: durationMs * 2,
    });
  }
  return { status: "renewed", leaseExpiresAt, durationMs };
}

/**
 * Extends an expired lease for a turn whose sandbox process the watchdog can
 * still see running. Stamps `silentSince` on the first grace cycle so the
 * reconciler can bound how long it keeps waiting; later cycles keep the
 * original stamp. The absolute 2-hour limit is enforced exactly as
 * `renewTurnLease` does.
 */
export async function graceExpiredTurnLease(
  ctx: MutationCtx,
  turn: Doc<"turns">,
  now: number,
): Promise<void> {
  if (!turn.open || isTerminalTurnState(turn.state)) return;
  if (turnExceededAbsoluteLimit(turn.turnStartedAt, now)) {
    await closeTurn(ctx, turn, "error", {
      error: "Turn exceeded the 2-hour limit",
    });
    return;
  }
  await ctx.db.patch(turn._id, {
    leaseExpiresAt: turnLeaseExpiry({
      state: turn.state,
      turnStartedAt: turn.turnStartedAt,
      now,
    }),
    silentSince: turn.silentSince ?? now,
  });
}

export async function resolveCompletionTurn(
  ctx: MutationCtx,
  params: {
    entityId: ChatTurnEntityId;
    turnId?: string;
    leaseGeneration?: number;
    placeholderMessageId?: Id<"messages">;
  },
): Promise<CompletionTurnResolution> {
  const current = await findOpenTurn(ctx, params.entityId);
  if (params.turnId === undefined || params.leaseGeneration === undefined) {
    return current ? { status: "stale" } : { status: "legacy" };
  }
  const turnId = ctx.db.normalizeId("turns", params.turnId);
  if (!turnId) return { status: "stale" };
  const turn = await ctx.db.get(turnId);
  if (
    !turn ||
    !turn.open ||
    turn.entityId !== params.entityId ||
    turn.leaseGeneration !== params.leaseGeneration ||
    !current ||
    current._id !== turn._id ||
    (params.placeholderMessageId !== undefined &&
      params.placeholderMessageId !== turn.placeholderMessageId)
  ) {
    return { status: "stale" };
  }
  return { status: "current", turn };
}

export async function closeTurn(
  ctx: MutationCtx,
  turn: Doc<"turns">,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  if (!turn.open || !canTransitionTurn(turn.state, state)) return;
  const finishedAt = Date.now();
  await ctx.db.patch(turn._id, {
    state,
    open: false,
    finishedAt,
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  });
  // Every durable turn ends here, so this is the one place the idle-pause
  // sweep learns "the agent finished". The id's table names the surface.
  const activityRef = activityRefForParentId(ctx.db, turn.entityId);
  if (activityRef) await touchAgentFinished(ctx, activityRef, finishedAt);
}

export async function closeOpenTurn(
  ctx: MutationCtx,
  entityId: ChatTurnEntityId,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  const turn = await findOpenTurn(ctx, entityId);
  if (turn) await closeTurn(ctx, turn, state, patch);
}

export async function closeTurnForWorkflow(
  ctx: MutationCtx,
  entityId: ChatTurnEntityId,
  workflowId: string,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  const turn = await findOpenTurn(ctx, entityId);
  if (!turn || turn.workflowId !== workflowId) return;
  await closeTurn(ctx, turn, state, patch);
}
