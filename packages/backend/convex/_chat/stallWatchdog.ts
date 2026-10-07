import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { cancelTrackedWorkflow } from "../workflowManager";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import {
  STALE_RECHECK_MS,
  staleProbeFollowUp,
  staleTurnDecision,
} from "../_taskWorkflow/staleness";
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

  // The legacy heartbeat chain and the lease reconciler both finalise stalls
  // until the lease is the only authority. Closing the durable turn here stops
  // the reconciler from tearing the same turn down a second time.
  await closeTurnForWorkflow(ctx, id, workflowId, "error", {
    error: alert.text,
  });

  await adapter.release(ctx, id, {
    sandboxStopped: opts.sandboxStopped === true,
  });

  await adapter.drainQueue(ctx, id);
}

/**
 * Recurring no-heartbeat check for one chat turn. Armed by the surface's
 * `trackXWorkflow`, re-schedules itself every STALE_RECHECK_MS while the
 * tracked workflow is still the entity's active one, and ends with the turn.
 * On staleness it first probes sandbox + callback liveness (transport flaps
 * must not kill live work) and only then finalises the turn — so a dead agent
 * process surfaces as a clear error within minutes instead of hanging on
 * "Working…" until the 2-hour workflow-timeout backstop.
 */
export async function runStaleChatHeartbeatCheck<TId extends ChatId, TEntity>(
  ctx: MutationCtx,
  adapter: ChatSurfaceAdapter<TId, TEntity>,
  args: {
    id: TId;
    workflowId: string;
    turnStartedAt: number;
    // Set by the liveness probe once it has confirmed the sandbox/callback is
    // dead, so the kill proceeds without another probe round-trip.
    skipLivenessProbe?: boolean;
    // Set by the probe when the sandbox VM itself is no longer running (e.g.
    // it hit the provider's runtime limit) — the failure message names the
    // stopped sandbox and the entity is closed instead of left "active".
    sandboxStopped?: boolean;
  },
): Promise<void> {
  const entity = await adapter.getEntity(ctx, args.id);
  // Turn finished or was replaced by a newer one — the chain ends here.
  if (!entity || adapter.activeWorkflowId(entity) !== args.workflowId) return;

  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) =>
      q.eq("entityId", adapter.streamingEntityId(args.id)),
    )
    .first();
  const decision = staleTurnDecision({
    currentActivity: streaming?.currentActivity,
    lastUpdatedAt: streaming?.lastUpdatedAt,
    turnStartedAt: args.turnStartedAt,
    hasSandbox: !!adapter.sandboxId(entity),
    now: Date.now(),
  });

  if (!decision.stale) {
    // The turn is alive — push the sandbox's hard session deadline out so the
    // provider's runtime cap can never kill live work (observed twice in
    // prod: turns dead ~60min after resume, no snapshot, filesystem rolled
    // back). 2× the tick keeps the deadline sliding ahead through missed or
    // delayed checks; when the turn ends the checks stop and the sandbox
    // stops on its ordinary schedule again.
    const liveSandboxId = adapter.sandboxId(entity);
    const liveRepoId = adapter.repoId(entity);
    if (liveSandboxId && liveRepoId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.extendSandboxDeadline, {
        sandboxId: liveSandboxId,
        repoId: liveRepoId,
        durationMs: STALE_RECHECK_MS * 2,
      });
    }
    await adapter.scheduleCheck(ctx, args.id, STALE_RECHECK_MS, {
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
    });
    return;
  }

  // Stale. Probe before killing unless the probe already ran, we are in the
  // startup phase (the callback is not guaranteed to exist yet), or there is
  // no sandbox (+ repo, needed by verifySandboxLiveness) to probe.
  const sandboxId = adapter.sandboxId(entity);
  const repoId = adapter.repoId(entity);
  if (
    !args.skipLivenessProbe &&
    decision.phase !== "startup" &&
    sandboxId &&
    repoId
  ) {
    await adapter.scheduleProbe(ctx, args.id, {
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
      sandboxId,
      repoId,
      streamingAgeMs: decision.ageMs,
    });
    return;
  }

  const staleSeconds = Math.round(decision.ageMs / 1000);
  console.log(
    `[watchdog][${adapter.logLabel}-stall] ${adapter.idLogLabel}=${args.id} phase=${decision.phase} ageMs=${decision.ageMs} thresholdMs=${decision.thresholdMs} skipProbe=${args.skipLivenessProbe ?? false} sandboxStopped=${args.sandboxStopped ?? false}`,
  );
  const alert = args.sandboxStopped
    ? adapter.alerts.sandboxStopped(staleSeconds)
    : adapter.alerts.stalled(
        staleSeconds,
        decision.phase,
        Math.round(decision.thresholdMs / 1000),
      );
  await finalizeStaleChatTurn(
    ctx,
    adapter,
    args.id,
    entity,
    args.workflowId,
    alert,
    {
      sandboxStopped: args.sandboxStopped === true,
    },
  );
}

/**
 * Pre-kill liveness gate for a stale chat turn: asks the sandbox provider
 * whether the VM is running and the callback PID (or an agent CLI process) is
 * alive. Confirmed alive → touch the streaming row (resets the staleness
 * clock) and keep checking, so transport flaps never kill live work. Dead →
 * re-enter the check with the probe suppressed so the kill proceeds
 * immediately. Unreachable → keep checking WITHOUT touching the row, so a
 * turn we cannot verify at all dies at STALE_UNVERIFIED_KILL_THRESHOLD_MS
 * instead of hanging on "Working…" until the 2h backstop (see
 * staleProbeFollowUp).
 */
export async function runStaleChatLivenessProbe<TId extends ChatId, TEntity>(
  ctx: ActionCtx,
  adapter: ChatSurfaceAdapter<TId, TEntity>,
  args: {
    id: TId;
    workflowId: string;
    turnStartedAt: number;
    sandboxId: string;
    repoId: Id<"githubRepos">;
    streamingAgeMs: number;
  },
): Promise<void> {
  const liveness = await ctx.runAction(internal.sandbox.verifySandboxLiveness, {
    sandboxId: args.sandboxId,
    repoId: args.repoId,
  });

  console.log(
    `[watchdog][${adapter.logLabel}-probe] ${adapter.idLogLabel}=${args.id} alive=${liveness.alive} reason=${liveness.reason} sandboxState=${liveness.sandboxState ?? "unknown"} pidAlive=${liveness.pidAlive ?? "n/a"} streamingAgeMs=${args.streamingAgeMs}`,
  );

  const followUp = staleProbeFollowUp({
    alive: liveness.alive,
    reason: liveness.reason,
    streamingAgeMs: args.streamingAgeMs,
  });

  if (followUp === "confirmed_alive") {
    await ctx.runMutation(internal.streaming.internalTouch, {
      entityId: adapter.streamingEntityId(args.id),
    });
    await adapter.scheduleCheck(ctx, args.id, STALE_RECHECK_MS, {
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
    });
    return;
  }

  if (followUp === "await_verification") {
    await adapter.scheduleCheck(ctx, args.id, STALE_RECHECK_MS, {
      workflowId: args.workflowId,
      turnStartedAt: args.turnStartedAt,
    });
    return;
  }

  await adapter.scheduleCheck(ctx, args.id, 0, {
    workflowId: args.workflowId,
    turnStartedAt: args.turnStartedAt,
    skipLivenessProbe: true,
    // "sandbox_not_started" means the VM itself is gone (e.g. provider
    // runtime limit) — a different failure than a dead process on a live VM,
    // and the kill must not exec on it (exec lazily resumes).
    sandboxStopped: liveness.reason === "sandbox_not_started",
  });
}
