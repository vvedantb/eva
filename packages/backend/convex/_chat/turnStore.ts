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

export async function findOpenSessionTurn(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
): Promise<Doc<"turns"> | null> {
  return await ctx.db
    .query("turns")
    .withIndex("by_entity_open", (q) =>
      q
        .eq("surface", "session")
        .eq("entityId", String(sessionId))
        .eq("open", true),
    )
    .first();
}

export async function openSessionTurn(
  ctx: MutationCtx,
  params: {
    sessionId: Id<"sessions">;
    streamingEntityId: string;
    placeholderMessageId: Id<"messages">;
    prompt: string;
    attachmentStorageIds?: Id<"_storage">[];
    model: Doc<"turns">["model"];
    sandboxId?: string;
    repoId: Id<"githubRepos">;
  },
): Promise<Id<"turns">> {
  const now = Date.now();
  const previous = await findOpenSessionTurn(ctx, params.sessionId);
  if (previous) {
    await closeTurn(ctx, previous, "cancelled", {
      error: "Superseded by a newer turn",
    });
  }
  const turnId = await ctx.db.insert("turns", {
    surface: "session",
    entityId: String(params.sessionId),
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
  await ctx.db.patch(params.sessionId, { turnLifecycleVersion: 2 });
  return turnId;
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
  const sessionId = ctx.db.normalizeId("sessions", turn.entityId);
  if (!sessionId) return { status: "terminal", reason: "unknown_turn" };
  const current = await findOpenSessionTurn(ctx, sessionId);
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
    sessionId: Id<"sessions">;
    turnId?: string;
    leaseGeneration?: number;
    placeholderMessageId?: Id<"messages">;
  },
): Promise<CompletionTurnResolution> {
  const current = await findOpenSessionTurn(ctx, params.sessionId);
  if (params.turnId === undefined || params.leaseGeneration === undefined) {
    return current ? { status: "stale" } : { status: "legacy" };
  }
  const turnId = ctx.db.normalizeId("turns", params.turnId);
  if (!turnId) return { status: "stale" };
  const turn = await ctx.db.get(turnId);
  if (
    !turn ||
    !turn.open ||
    turn.entityId !== String(params.sessionId) ||
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
  await ctx.db.patch(turn._id, {
    state,
    open: false,
    finishedAt: Date.now(),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  });
}

export async function closeOpenSessionTurn(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  const turn = await findOpenSessionTurn(ctx, sessionId);
  if (turn) await closeTurn(ctx, turn, state, patch);
}

export async function closeTurnForWorkflow(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  workflowId: string,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  const turn = await findOpenSessionTurn(ctx, sessionId);
  if (!turn || turn.workflowId !== workflowId) return;
  await closeTurn(ctx, turn, state, patch);
}
