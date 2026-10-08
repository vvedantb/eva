import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { pendingTurnValidator } from "../_validators/tableFields";
import { DAEMON_CLAIM_PAUSE_MS } from "../_chat/daemonClaimPause";

const emptyDaemonEntitySnapshot = {
  pendingTurn: undefined,
  activeWorkflow: undefined,
  syntheticTurnMessageId: undefined,
};

// Long enough to cover a normal launch (token mint + upload + boot ≈ 5–15s),
// short enough that a launcher that died without releasing never blocks the
// next boot for long. Archived-sandbox resumes can outlive the lease — the
// in-sandbox spawn flock still dedupes any launch that slips past it.
const DAEMON_LAUNCH_LEASE_MS = 30_000;

/**
 * Single-flight claim for a warm-daemon launch. Convex mutations are
 * serializable, so exactly one concurrent caller wins. Prewarm losers wait
 * for this lease to drop rather than skipping: a skip stranded the
 * pending-turn model when page-open had already claimed with lastModel.
 * The winner releases via releaseDaemonLaunchLease when its launch settles;
 * the in-sandbox spawn flock still dedupes any launch that slips past it.
 */
export const claimDaemonLaunchLease = internalMutation({
  args: { entityId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("daemonLaunchLeases")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .unique();
    if (existing && existing.expiresAt > now) return false;
    if (existing) {
      await ctx.db.patch(existing._id, {
        expiresAt: now + DAEMON_LAUNCH_LEASE_MS,
      });
    } else {
      await ctx.db.insert("daemonLaunchLeases", {
        entityId: args.entityId,
        expiresAt: now + DAEMON_LAUNCH_LEASE_MS,
      });
    }
    return true;
  },
});

/** Releases a launch lease once the launch settled (success or failure). */
export const releaseDaemonLaunchLease = internalMutation({
  args: { entityId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("daemonLaunchLeases")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * Fences turn claims across a prewarm daemon kill. Prewarm sets this before it
 * reads the entity's turn state, so the read is authoritative: no claim can
 * slip in between the decision to kill and the process dying, which is what
 * left a claimed turn's 2-minute lease with nobody heartbeating it. Prewarm
 * clears it the moment the kill exec returns; the TTL only covers a prewarm
 * that died mid-kill.
 */
export const setDaemonClaimPause = internalMutation({
  args: {
    entityTable: v.union(
      v.literal("sessionChats"),
      v.literal("sessions"),
      v.literal("agentTasks"),
      v.literal("projects"),
    ),
    entityId: v.string(),
    paused: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimPausedUntil = args.paused
      ? Date.now() + DAEMON_CLAIM_PAUSE_MS
      : undefined;
    if (args.entityTable === "sessionChats") {
      const id = ctx.db.normalizeId("sessionChats", args.entityId);
      if (!id) return null;
      if (!(await ctx.db.get(id))) return null;
      await ctx.db.patch(id, { claimPausedUntil });
      return null;
    }
    if (args.entityTable === "sessions") {
      const id = ctx.db.normalizeId("sessions", args.entityId);
      if (!id) return null;
      if (!(await ctx.db.get(id))) return null;
      await ctx.db.patch(id, { claimPausedUntil });
      return null;
    }
    if (args.entityTable === "agentTasks") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      if (!id) return null;
      await ctx.db.patch(id, { claimPausedUntil });
      return null;
    }
    const id = ctx.db.normalizeId("projects", args.entityId);
    if (!id) return null;
    await ctx.db.patch(id, { claimPausedUntil });
    return null;
  },
});

/** Reads daemon-relevant fields for mid-turn respawn deferral decisions. */
export const readDaemonEntitySnapshot = internalQuery({
  args: {
    entityTable: v.union(
      v.literal("sessionChats"),
      v.literal("sessions"),
      v.literal("agentTasks"),
      v.literal("projects"),
    ),
    entityId: v.string(),
  },
  returns: v.object({
    pendingTurn: pendingTurnValidator,
    activeWorkflow: v.optional(v.string()),
    syntheticTurnMessageId: v.optional(v.id("messages")),
  }),
  handler: async (ctx, args) => {
    if (args.entityTable === "sessionChats") {
      const id = ctx.db.normalizeId("sessionChats", args.entityId);
      if (!id) return emptyDaemonEntitySnapshot;
      const doc = await ctx.db.get(id);
      if (!doc) return emptyDaemonEntitySnapshot;
      return {
        pendingTurn: doc.pendingTurn,
        activeWorkflow: doc.activeWorkflowId,
        syntheticTurnMessageId: doc.syntheticTurnMessageId,
      };
    }
    if (args.entityTable === "sessions") {
      const id = ctx.db.normalizeId("sessions", args.entityId);
      if (!id) return emptyDaemonEntitySnapshot;
      const doc = await ctx.db.get(id);
      if (!doc) return emptyDaemonEntitySnapshot;
      return {
        pendingTurn: doc.pendingTurn,
        activeWorkflow: doc.activeWorkflowId,
        syntheticTurnMessageId: doc.syntheticTurnMessageId,
      };
    }
    if (args.entityTable === "agentTasks") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      if (!id) return emptyDaemonEntitySnapshot;
      const doc = await ctx.db.get(id);
      if (!doc) return emptyDaemonEntitySnapshot;
      return {
        pendingTurn: doc.pendingTurn,
        activeWorkflow: doc.activeChatWorkflowId,
        syntheticTurnMessageId: doc.syntheticTurnMessageId,
      };
    }
    const id = ctx.db.normalizeId("projects", args.entityId);
    if (!id) return emptyDaemonEntitySnapshot;
    const doc = await ctx.db.get(id);
    if (!doc) return emptyDaemonEntitySnapshot;
    return {
      pendingTurn: doc.pendingTurn,
      activeWorkflow: doc.activeChatWorkflowId,
      syntheticTurnMessageId: doc.syntheticTurnMessageId,
    };
  },
});

/**
 * True once the entity's sandbox is stopping/closed (or the entity is gone).
 * Background work that can outlive a Stop (prewarm waits up to a lease window)
 * polls this before any exec, because a Vercel exec lazily resumes a stopped
 * VM and would leave it running, unseen by the idle sweep.
 */
export const isEntitySandboxStopRequested = internalQuery({
  args: {
    entityTable: v.union(
      v.literal("sessions"),
      v.literal("agentTasks"),
      v.literal("projects"),
    ),
    entityId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const isStopped = (status: string | undefined) =>
      status === "stopping" || status === "closed";
    if (args.entityTable === "sessions") {
      const id = ctx.db.normalizeId("sessions", args.entityId);
      const doc = id ? await ctx.db.get(id) : null;
      return !doc || isStopped(doc.status);
    }
    if (args.entityTable === "agentTasks") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      const doc = id ? await ctx.db.get(id) : null;
      return !doc || isStopped(doc.reviewTaskSandboxStatus);
    }
    const id = ctx.db.normalizeId("projects", args.entityId);
    const doc = id ? await ctx.db.get(id) : null;
    return !doc || isStopped(doc.reviewProjectSandboxStatus);
  },
});

const activeSandboxEntityValidator = v.object({
  entityTable: v.union(
    v.literal("sessions"),
    v.literal("agentTasks"),
    v.literal("projects"),
  ),
  entityId: v.string(),
  sandboxId: v.string(),
  repoId: v.id("githubRepos"),
});

/**
 * Every entity whose sandbox status says "active", with the fields the
 * reconcile sweep needs to verify that against the provider. Full scan —
 * these tables are small and the sweep runs on a coarse interval.
 */
export const listActiveSandboxEntities = internalQuery({
  args: {},
  returns: v.array(activeSandboxEntityValidator),
  handler: async (ctx) => {
    const [sessions, tasks, projects] = await Promise.all([
      ctx.db.query("sessions").collect(),
      ctx.db.query("agentTasks").collect(),
      ctx.db.query("projects").collect(),
    ]);
    const out: Array<{
      entityTable: "sessions" | "agentTasks" | "projects";
      entityId: string;
      sandboxId: string;
      repoId: Id<"githubRepos">;
    }> = [];
    for (const s of sessions) {
      if (s.status === "active" && typeof s.sandboxId === "string") {
        out.push({
          entityTable: "sessions",
          entityId: String(s._id),
          sandboxId: s.sandboxId,
          repoId: s.repoId,
        });
      }
    }
    for (const t of tasks) {
      if (
        t.reviewTaskSandboxStatus === "active" &&
        typeof t.sandboxId === "string" &&
        t.repoId !== undefined
      ) {
        out.push({
          entityTable: "agentTasks",
          entityId: String(t._id),
          sandboxId: t.sandboxId,
          repoId: t.repoId,
        });
      }
    }
    for (const p of projects) {
      if (
        p.reviewProjectSandboxStatus === "active" &&
        typeof p.sandboxId === "string" &&
        p.repoId !== undefined
      ) {
        out.push({
          entityTable: "projects",
          entityId: String(p._id),
          sandboxId: p.sandboxId,
          repoId: p.repoId,
        });
      }
    }
    return out;
  },
});

/**
 * Reconciles a stale "active" sandbox status to "closed" when prewarm
 * observes the sandbox is not actually running. On Vercel, a stopped VM
 * with a lingering "active" status would otherwise let the Console/PTY
 * path lazily resume it without its dev server, Convex backend, or tmux
 * session — those only launch in the startup workflow. Flipping to
 * "closed" makes the UI offer Start, the one path that relaunches them.
 *
 * Only flips when the doc still points at the sandbox the caller observed
 * and the current status is exactly "active" — "starting"/"stopping"/
 * "closed" are left alone since the start/stop flows own those.
 */
export const reconcileStoppedSandboxStatus = internalMutation({
  args: {
    entityTable: v.union(
      v.literal("sessionChats"),
      v.literal("sessions"),
      v.literal("agentTasks"),
      v.literal("projects"),
    ),
    entityId: v.string(),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.entityTable === "sessionChats" || args.entityTable === "sessions") {
      // A chat shares its session's sandbox, so its status lives on the session.
      const chatId =
        args.entityTable === "sessionChats"
          ? ctx.db.normalizeId("sessionChats", args.entityId)
          : null;
      const chat = chatId ? await ctx.db.get(chatId) : null;
      const id =
        args.entityTable === "sessionChats"
          ? (chat?.sessionId ?? null)
          : ctx.db.normalizeId("sessions", args.entityId);
      if (!id) return null;
      const doc = await ctx.db.get(id);
      if (!doc) return null;
      if (doc.sandboxId !== args.sandboxId) {
        return null;
      }
      if (doc.status !== "active") return null;
      await ctx.db.patch(id, { status: "closed", updatedAt: Date.now() });
      console.log(
        `[sandbox] reconcileStoppedSandboxStatus: sessions ${id} active → closed (sandbox ${args.sandboxId} not running)`,
      );
      return null;
    }
    if (args.entityTable === "agentTasks") {
      const id = ctx.db.normalizeId("agentTasks", args.entityId);
      if (!id) return null;
      const doc = await ctx.db.get(id);
      if (!doc) return null;
      if (doc.sandboxId !== args.sandboxId) {
        return null;
      }
      if (doc.reviewTaskSandboxStatus !== "active") return null;
      await ctx.db.patch(id, { reviewTaskSandboxStatus: "closed" });
      console.log(
        `[sandbox] reconcileStoppedSandboxStatus: agentTasks ${id} active → closed (sandbox ${args.sandboxId} not running)`,
      );
      return null;
    }
    const id = ctx.db.normalizeId("projects", args.entityId);
    if (!id) return null;
    const doc = await ctx.db.get(id);
    if (!doc) return null;
    if (doc.sandboxId !== args.sandboxId) {
      return null;
    }
    if (doc.reviewProjectSandboxStatus !== "active") return null;
    await ctx.db.patch(id, { reviewProjectSandboxStatus: "closed" });
    console.log(
      `[sandbox] reconcileStoppedSandboxStatus: projects ${id} active → closed (sandbox ${args.sandboxId} not running)`,
    );
    return null;
  },
});
