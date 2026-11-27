import {
  onTaskRunTurnClosed,
  onTaskRunTurnOpened,
} from "../_agentTasks/taskRunStatus";
import { TURN_BACKSTOP_ERROR } from "@eva/shared/agentTurnLimits";
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
import { chatParentIdOf } from "./chatParent";
import { stampChatActivity } from "../chatReads";

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

/** Every durable turn owner. The id's table picks the surface. */
export type TurnEntityId = Doc<"turns">["entityId"];

/** Chat entities that own durable turns. */
export type ChatTurnEntityId = Id<"sessionChats"> | Id<"sessions">;

/** The entity's open turn. */
export async function findOpenTurn(
  ctx: QueryCtx,
  entityId: TurnEntityId,
): Promise<Doc<"turns"> | null> {
  return await ctx.db
    .query("turns")
    .withIndex("by_entity_open", (q) =>
      q.eq("entityId", entityId).eq("open", true),
    )
    .first();
}

/**
 * The entity's latest turn: the open one, else the last closed one.
 * Follow-up rows (alerts, retries, continuations) read it to find their thread.
 */
export async function findLatestTurn(
  ctx: QueryCtx,
  entityId: TurnEntityId,
): Promise<Doc<"turns"> | null> {
  return (
    (await findOpenTurn(ctx, entityId)) ??
    (await ctx.db
      .query("turns")
      .withIndex("by_entity_open", (q) =>
        q.eq("entityId", entityId).eq("open", false),
      )
      .order("desc")
      .first())
  );
}

export async function findOpenSessionTurn(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
): Promise<Doc<"turns"> | null> {
  return await findOpenTurn(ctx, sessionId);
}

type OpenTurnFields = {
  streamingEntityId: string;
  /** Chat turns only: runs and one-shot agents have no placeholder message. */
  placeholderMessageId?: Id<"messages">;
  /** Chat turns only: the thread root this turn answers in. */
  replyTo?: Id<"messages">;
  /** Thread turns only: who asked; Eva's answer notifies them. */
  askedBy?: Id<"users">;
  /** Chat turns only: this turn runs its task (`taskRunTurn.ts`). */
  taskRun?: Doc<"turns">["taskRun"];
  prompt?: string;
  attachmentStorageIds?: Id<"_storage">[];
  model: Doc<"turns">["model"];
  sandboxId?: string;
  repoId: Id<"githubRepos">;
};

/** Opens a durable turn and supersedes any turn the entity still has open. */
export async function openTurn(
  ctx: MutationCtx,
  params: OpenTurnFields & {
    entityId: TurnEntityId;
    /**
     * The session the turn holds: a chat's session, or the session whose
     * sandbox a one-shot agent works on.
     */
    sessionId?: Id<"sessions">;
  },
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
    sessionId: params.sessionId,
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
    replyTo: params.replyTo,
    askedBy: params.replyTo === undefined ? undefined : params.askedBy,
    prompt: params.prompt,
    attachmentStorageIds: params.attachmentStorageIds,
    model: params.model,
    sandboxId: params.sandboxId,
    repoId: params.repoId,
    taskRun: params.taskRun,
  });
}

/**
 * Opens a session chat's turn. Chats are born durable, so there is no
 * lifecycle marker to set; the session id rides along for the per-session
 * cap and the sidebar projection.
 */
export async function openSessionChatTurn(
  ctx: MutationCtx,
  params: OpenTurnFields & {
    chatId: Id<"sessionChats">;
    sessionId: Id<"sessions">;
  },
): Promise<Id<"turns">> {
  const { chatId, sessionId, ...turn } = params;
  const turnId = await openTurn(ctx, { ...turn, entityId: chatId, sessionId });
  // A quick task's run moves its card when its turn starts, as when it ends.
  if (turn.taskRun !== undefined) await onTaskRunTurnOpened(ctx, sessionId);
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
      error: TURN_BACKSTOP_ERROR,
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
 * original stamp. The absolute `TURN_BACKSTOP_MS` limit is enforced exactly as
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
      error: TURN_BACKSTOP_ERROR,
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
    entityId: TurnEntityId;
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

/**
 * True when a chat result arrives for a turn that was already closed (cancel,
 * lease sweep) while a newer workflow holds the chat's slot. Saving it would
 * write into the newer turn's reply and clear its slot, so the queue starts a
 * third turn on top of the live one. Every chat surface binds the turn's
 * workflow id before it fills the slot, so a mismatch means "not mine".
 * Session chats pass their open turn's workflow (`openTurnWorkflowId`).
 */
export function isSupersededChatResult(
  turn: Doc<"turns"> | null,
  activeWorkflowId: string | undefined,
): boolean {
  return (
    turn !== null &&
    !turn.open &&
    activeWorkflowId !== undefined &&
    activeWorkflowId !== turn.workflowId
  );
}

export async function closeTurn(
  ctx: MutationCtx,
  turn: Doc<"turns">,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  // Re-read: a caller's copy can be stale when an earlier step in the same
  // mutation already closed the turn.
  const current = await ctx.db.get(turn._id);
  if (!current?.open || !canTransitionTurn(current.state, state)) return;
  const finishedAt = Date.now();
  await ctx.db.patch(turn._id, {
    state,
    open: false,
    finishedAt,
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  });
  // A quick task's run moves its card when its turn ends, however it ends.
  if (current.taskRun !== undefined) {
    await onTaskRunTurnClosed(ctx, current, state);
  }
  // The unread clock read by `chatReads.ts`: chat turns, a task's runs
  // included. `stampChatActivity` stamps the chat, its session and the session's task
  // or project, and skips a chat that lease sweeps found hard-deleted.
  const chatParentId =
    chatParentIdOf(ctx.db, turn.entityId);
  if (chatParentId) {
    await stampChatActivity(ctx, chatParentId, {
      lastTurnFinishedAt: finishedAt,
    });
  }
  // Every durable turn ends here, so this is the one place the idle-pause
  // sweep learns "the agent finished": any turn counts for the session that
  // holds the sandbox.
  const activityRef = activityRefForParentId(
    ctx.db,
    turn.sessionId ?? turn.entityId,
  );
  if (activityRef) await touchAgentFinished(ctx, activityRef, finishedAt);
}

export async function closeOpenTurn(
  ctx: MutationCtx,
  entityId: TurnEntityId,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  const turn = await findOpenTurn(ctx, entityId);
  if (turn) await closeTurn(ctx, turn, state, patch);
}

export async function closeTurnForWorkflow(
  ctx: MutationCtx,
  entityId: TurnEntityId,
  workflowId: string,
  state: TerminalTurnState,
  patch: { error?: string } = {},
): Promise<void> {
  const turn = await findOpenTurn(ctx, entityId);
  if (!turn || turn.workflowId !== workflowId) return;
  await closeTurn(ctx, turn, state, patch);
}

/**
 * The fence check every one-shot agent completion runs first. Null: the
 * completion holds no current lease, so the caller drops it. A turn: the
 * caller handles it; the turn is closed here, since the agent's work is over
 * once it reports (the workflow's own steps after that are covered by the
 * `TURN_BACKSTOP_MS` backstop).
 */
export async function settleAgentTurnCompletion(
  ctx: MutationCtx,
  params: {
    entityId: TurnEntityId;
    turnId?: string;
    leaseGeneration?: number;
    success: boolean;
    error: string | null;
  },
): Promise<Doc<"turns"> | null> {
  // Every one-shot agent launches under a turn and always sends its lease.
  const resolution = await resolveCompletionTurn(ctx, params);
  if (resolution.status !== "current") return null;
  await closeTurn(
    ctx,
    resolution.turn,
    params.success ? "done" : "error",
    params.success ? {} : { error: params.error ?? "Agent failed" },
  );
  return resolution.turn;
}
