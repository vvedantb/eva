import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authMutation, authQuery, hasActiveRun } from "./functions";
import { sandboxPresenceRoomId } from "@eva/shared";
import { isAnyonePresentInRoom } from "./presence";
import {
  openChatEntityIdsFor,
  projectIsExecuting,
  sessionIsExecuting,
  taskIsExecuting,
} from "./_chat/turnProjection";
import { requestSessionSandboxStop } from "./_sessions/sandbox";
import { requestTaskSandboxStop } from "./_agentTasks/sandbox";
import { requestProjectSandboxStop } from "./_projects/sandbox";
import { usageLimitHoldFor } from "./_queues/helpers";
import {
  getSandboxActivity,
  sandboxActivityRefArgs,
  type SandboxActivityRef,
} from "./_sandbox/activity";
import {
  decideIdlePause,
  fallbackLastActivity,
  isStreamingRowFresh,
  resolveIdleThresholds,
  type IdleThresholds,
} from "./_sandbox/idlePolicy";
import { sandboxIdlePauseModeValidator } from "./_validators/tableFields";

/**
 * Idle pause: stops sandboxes nobody is using (Amp-orb style) so Vercel stops
 * billing provisioned memory for them. Pause/resume is already what Stop and
 * Start do (snapshot + resume), so the only new behaviour is *when* a stop is
 * requested.
 *
 * Gated by `appSettings.sandboxIdlePauseMode`:
 *   - `off`     — this module does nothing (default; identical to pre-feature).
 *   - `dry-run` — logs `[sandboxIdlePause] would-pause …` per candidate.
 *   - `on`      — logs `[sandboxIdlePause] pause …` and requests the stop.
 *
 * The daily `sandboxAutoStop` sweep is untouched and keeps running alongside.
 */

/** Upper bound on pauses per 5-minute tick so one sweep never floods the provider. */
const MAX_PAUSES_PER_RUN = 25;

const settingsShape = {
  mode: sandboxIdlePauseModeValidator,
  afterAgentMinutes: v.number(),
  afterInteractionMinutes: v.number(),
};

/** Settings-page read. Defaults (off / 5 / 20) when the row or fields are missing. */
export const getSandboxIdlePauseSettings = authQuery({
  args: {},
  returns: v.object(settingsShape),
  handler: async (ctx) => {
    const doc = await ctx.db.query("appSettings").first();
    const thresholds = resolveIdleThresholds(doc);
    return thresholdsToMinutes(thresholds);
  },
});

/** Settings-page write. Upserts the single `appSettings` row. */
export const setSandboxIdlePauseSettings = authMutation({
  args: settingsShape,
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !Number.isFinite(args.afterAgentMinutes) ||
      !Number.isFinite(args.afterInteractionMinutes) ||
      args.afterAgentMinutes < 1 ||
      args.afterInteractionMinutes < 1
    ) {
      throw new Error("Idle pause minutes must be at least 1");
    }
    const patch = {
      sandboxIdlePauseMode: args.mode,
      sandboxIdleAfterAgentMinutes: Math.floor(args.afterAgentMinutes),
      sandboxIdleAfterInteractionMinutes: Math.floor(
        args.afterInteractionMinutes,
      ),
    };
    const existing = await ctx.db.query("appSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      // The daily auto-stop fields are required on the row; mirror the
      // defaults `getSandboxAutoStopSettings` reports when no row exists.
      await ctx.db.insert("appSettings", {
        sandboxAutoStopEnabled: false,
        sandboxAutoStopTime: "22:00",
        sandboxAutoStopTimeZone: "UTC",
        ...patch,
      });
    }
    return null;
  },
});

/** Internal: thresholds in milliseconds for the sweep. */
export const getSettingsInternal = internalQuery({
  args: {},
  returns: v.object({
    mode: sandboxIdlePauseModeValidator,
    afterAgentMs: v.number(),
    afterInteractionMs: v.number(),
  }),
  handler: async (ctx) => {
    const doc = await ctx.db.query("appSettings").first();
    return resolveIdleThresholds(doc);
  },
});

function thresholdsToMinutes(thresholds: IdleThresholds) {
  return {
    mode: thresholds.mode,
    afterAgentMinutes: Math.round(thresholds.afterAgentMs / 60_000),
    afterInteractionMinutes: Math.round(thresholds.afterInteractionMs / 60_000),
  };
}

const candidateValidator = v.object({
  status: v.optional(v.string()),
  busy: v.boolean(),
  present: v.boolean(),
  lastUserActivityAt: v.number(),
  lastAgentFinishedAt: v.optional(v.number()),
});

type Candidate = {
  status: string | undefined;
  busy: boolean;
  present: boolean;
  lastUserActivityAt: number;
  lastAgentFinishedAt: number | undefined;
};

/**
 * True when a fresh streaming row or a queued follow-up exists for the entity.
 * A stale streaming row (see `isStreamingRowFresh`) does not count: leftover
 * rows from crashed turns or old data must not pin a sandbox awake forever.
 * Open turns, runs and workflows are the authoritative busy signals and are
 * checked separately by the callers.
 */
async function hasPendingWork(ctx: QueryCtx, entityId: string): Promise<boolean> {
  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (streaming && isStreamingRowFresh(streaming, Date.now())) return true;
  const sessionId = ctx.db.normalizeId("sessions", entityId);
  const taskId = ctx.db.normalizeId("agentTasks", entityId);
  const projectId = ctx.db.normalizeId("projects", entityId);
  const parentId = sessionId ?? taskId ?? projectId;
  if (!parentId) return false;
  const queued = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", parentId))
    .order("asc")
    .first();
  if (queued === null) return false;
  // A queue waiting out a usage limit sends nothing for hours, so it must not
  // keep the VM billing; its resume drain wakes the sandbox again.
  return (await usageLimitHoldFor(ctx, parentId, queued)) === null;
}

async function inspectSession(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
): Promise<Candidate | null> {
  const session = await ctx.db.get(sessionId);
  if (!session) return null;
  const daemonState = await ctx.db
    .query("sessionDaemonStates")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .first();
  const busy =
    sessionIsExecuting(
      session,
      await openChatEntityIdsFor(ctx.db, sessionId),
    ) ||
    daemonState?.pendingTurn !== undefined ||
    (await hasPendingWork(ctx, String(sessionId)));
  return await finishCandidate(
    ctx,
    { kind: "session", entityId: String(sessionId) },
    session.status,
    busy,
    [session.updatedAt],
    session._creationTime,
  );
}

async function inspectTask(
  ctx: QueryCtx,
  taskId: Id<"agentTasks">,
): Promise<Candidate | null> {
  const task = await ctx.db.get(taskId);
  if (!task) return null;
  const busy =
    (await hasActiveRun(ctx.db, taskId)) ||
    taskIsExecuting(task, await openChatEntityIdsFor(ctx.db, taskId)) ||
    (await hasPendingWork(ctx, String(taskId)));
  return await finishCandidate(
    ctx,
    { kind: "task", entityId: String(taskId) },
    task.reviewTaskSandboxStatus,
    busy,
    [task.updatedAt],
    task._creationTime,
  );
}

async function inspectProject(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<Candidate | null> {
  const project = await ctx.db.get(projectId);
  if (!project) return null;
  const busy =
    projectIsExecuting(
      project,
      await openChatEntityIdsFor(ctx.db, projectId),
    ) || (await hasPendingWork(ctx, String(projectId)));
  return await finishCandidate(
    ctx,
    { kind: "project", entityId: String(projectId) },
    project.reviewProjectSandboxStatus,
    busy,
    [project.lastSandboxActivity],
    project._creationTime,
  );
}

async function finishCandidate(
  ctx: QueryCtx,
  ref: SandboxActivityRef,
  status: string | undefined,
  busy: boolean,
  fallbacks: Array<number | undefined>,
  creationTime: number,
): Promise<Candidate> {
  const activity = await getSandboxActivity(ctx.db, ref);
  const present = await isAnyonePresentInRoom(
    ctx,
    sandboxPresenceRoomId(ref.entityId),
  );
  return {
    status,
    busy,
    present,
    lastUserActivityAt:
      activity?.lastUserActivityAt ??
      fallbackLastActivity(fallbacks, creationTime),
    lastAgentFinishedAt: activity?.lastAgentFinishedAt,
  };
}

/** Internal: everything the policy needs for one entity, or null if it is gone. */
export const inspectCandidate = internalQuery({
  args: sandboxActivityRefArgs,
  returns: v.union(candidateValidator, v.null()),
  handler: async (ctx, args) => {
    if (args.kind === "session") {
      const id = ctx.db.normalizeId("sessions", args.entityId);
      return id ? await inspectSession(ctx, id) : null;
    }
    if (args.kind === "task") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      return id ? await inspectTask(ctx, id) : null;
    }
    const id = ctx.db.normalizeId("projects", args.entityId);
    return id ? await inspectProject(ctx, id) : null;
  },
});

/**
 * Internal: requests the stop. Re-reads status and busy state inside the
 * mutation so a turn that started between the sweep's read and this write wins.
 */
export const pause = internalMutation({
  args: { ...sandboxActivityRefArgs, idleMinutes: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const stopReason = { kind: "idle" as const, idleMinutes: args.idleMinutes };
    if (args.kind === "session") {
      const id = ctx.db.normalizeId("sessions", args.entityId);
      const candidate = id ? await inspectSession(ctx, id) : null;
      if (!id || !candidate || candidate.status !== "active" || candidate.busy) {
        return false;
      }
      await requestSessionSandboxStop(ctx, id, { stopReason });
      return true;
    }
    if (args.kind === "task") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      const candidate = id ? await inspectTask(ctx, id) : null;
      if (!id || !candidate || candidate.status !== "active" || candidate.busy) {
        return false;
      }
      await requestTaskSandboxStop(ctx, id, { stopReason });
      return true;
    }
    const id = ctx.db.normalizeId("projects", args.entityId);
    const candidate = id ? await inspectProject(ctx, id) : null;
    if (!id || !candidate || candidate.status !== "active" || candidate.busy) {
      return false;
    }
    await requestProjectSandboxStop(ctx, id, { stopReason });
    return true;
  },
});

/**
 * Cron entry point (every 5 minutes). A no-op while the mode is `off`, so
 * deployments that never enable the setting see no behaviour change.
 */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const thresholds = await ctx.runQuery(
      internal.sandboxIdlePause.getSettingsInternal,
      {},
    );
    if (thresholds.mode === "off") return null;

    const active = await ctx.runQuery(
      internal.sandboxAutoStop.listActiveSandboxes,
      {},
    );
    const refs: SandboxActivityRef[] = [
      ...active.sessionIds.map((id) => ({
        kind: "session" as const,
        entityId: String(id),
      })),
      ...active.taskIds.map((id) => ({
        kind: "task" as const,
        entityId: String(id),
      })),
      ...active.projectIds.map((id) => ({
        kind: "project" as const,
        entityId: String(id),
      })),
    ];

    const now = Date.now();
    let busy = 0;
    let present = 0;
    let paused = 0;
    for (const ref of refs) {
      const candidate = await ctx.runQuery(
        internal.sandboxIdlePause.inspectCandidate,
        ref,
      );
      if (!candidate) continue;
      if (candidate.present) {
        present += 1;
        // Presence is an interaction: restart the grace from now so the
        // sandbox outlives the tab by the configured window, not by zero.
        await ctx.runMutation(internal._sandbox.activity.touchUser, ref);
        continue;
      }
      const decision = decideIdlePause({
        now,
        mode: thresholds.mode,
        status: candidate.status,
        busy: candidate.busy,
        present: candidate.present,
        lastUserActivityAt: candidate.lastUserActivityAt,
        lastAgentFinishedAt: candidate.lastAgentFinishedAt,
        thresholds,
      });
      if (decision.action === "skip") {
        if (decision.reason === "busy") busy += 1;
        continue;
      }
      if (paused >= MAX_PAUSES_PER_RUN) continue;
      const verb = thresholds.mode === "on" ? "pause" : "would-pause";
      console.log(
        `[sandboxIdlePause] ${verb} kind=${ref.kind} id=${ref.entityId} idleMinutes=${decision.idleMinutes} lastUser=${new Date(candidate.lastUserActivityAt).toISOString()} lastAgent=${candidate.lastAgentFinishedAt === undefined ? "none" : new Date(candidate.lastAgentFinishedAt).toISOString()}`,
      );
      if (thresholds.mode === "on") {
        const stopped = await ctx.runMutation(
          internal.sandboxIdlePause.pause,
          { ...ref, idleMinutes: decision.idleMinutes },
        );
        if (!stopped) continue;
      }
      paused += 1;
    }
    console.log(
      `[sandboxIdlePause] sweep mode=${thresholds.mode} active=${refs.length} busy=${busy} present=${present} ${thresholds.mode === "on" ? "paused" : "would-pause"}=${paused}`,
    );
    return null;
  },
});
