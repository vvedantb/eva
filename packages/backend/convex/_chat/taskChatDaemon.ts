import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { authMutation, hasRepoAccess } from "../functions";
import {
  aiModelValidator,
  normalizeAIModel,
  daemonClaimResultValidator,
  turnCheckpointArgs,
  turnLeaseFenceArgs,
  usesChatDaemon,
} from "../validators";
import { backgroundAgentEntryValidator } from "../_validators/tableFields";
import { mergeBackgroundAgents } from "../_sessions/backgroundAgents";
import { scheduleScopeCheck } from "../_scopeCheck/mutations";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import {
  scheduleQueueDrainAfterBackgroundAgents,
  startNextQueuedTaskChatMessage,
} from "../_queues/helpers";
import { taskChatStreamEntityId } from "./surfaceAdapters";
import { isDaemonClaimPaused } from "./daemonClaimPause";
import { resolveStorageUrls } from "./storageUrls";
import {
  isPendingTurnLive,
  isTurnClaimed,
  isUnclaimedOpenTurn,
} from "../_sessions/pendingTurnRecovery";
import { syntheticTurnCompletionPatch } from "./chatResult";
import {
  advanceTurn,
  claimStagedTurn,
  closeTurn,
  findOpenTurn,
  leaseSyntheticTurn,
  openChatTurn,
  resolveCompletionTurn,
} from "./turnStore";

const emptyClaimReturn = {
  prompt: null,
  turnLifecycle: "legacy",
  attachmentUrls: [],
  stopTaskToolUseIds: [],
  cancelRequested: false,
  usageRefreshRequested: false,
} satisfies {
  prompt: null;
  turnLifecycle: "legacy";
  attachmentUrls: string[];
  stopTaskToolUseIds: string[];
  cancelRequested: boolean;
  usageRefreshRequested: boolean;
};

/** Daemon-pull turn claim for task sandbox chat (never the main run workflow). */
export const claimPendingTurn = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    model: v.optional(aiModelValidator),
    acceptTurn: v.optional(v.boolean()),
  },
  returns: daemonClaimResultValidator,
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return emptyClaimReturn;
    if (!task.repoId) throw new Error("Not authorized");
    // Daemon polls ~20×/s — skip team-membership join for the task creator.
    if (task.createdBy !== ctx.userId) {
      if (!(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
    }
    // Stops must drain unconditionally: a backgrounded agent outlives the chat
    // turn, and saveResult clears activeChatWorkflowId the moment the visible
    // turn finishes — gating the drain there would strand stop requests.
    const stopTaskToolUseIds = task.pendingTaskStops ?? [];
    if (stopTaskToolUseIds.length > 0) {
      await ctx.db.patch(args.taskId, { pendingTaskStops: undefined });
    }

    // Cancel requests must drain the same way: the daemon polls this mutation
    // mid-turn specifically to notice an interrupt, so gating on
    // activeChatWorkflowId/pendingTurn below would strand the signal.
    const cancelRequested = task.cancelRequestedAt !== undefined;
    if (cancelRequested) {
      await ctx.db.patch(args.taskId, { cancelRequestedAt: undefined });
    }

    // Level-triggered until the refresh action clears it — old callbacks must
    // not consume the chip's request as a no-op.
    const usageRefreshRequested = task.usageRefreshRequestedAt !== undefined;

    // A prewarm is killing this daemon right now. See the session copy in
    // `_sessions/workflow.ts`: claiming here strands the turn on a dying
    // process. Placed after the drains so a cancel is never stranded.
    if (
      isDaemonClaimPaused({
        claimPausedUntil: task.claimPausedUntil,
        now: Date.now(),
      })
    ) {
      return {
        ...emptyClaimReturn,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    // Chat daemon only — never claim a turn while the main PR run workflow is
    // the only active consumer.
    if (!task.activeChatWorkflowId) {
      return {
        ...emptyClaimReturn,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    if (!task.pendingTurn) {
      return {
        ...emptyClaimReturn,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    if (args.acceptTurn === false) {
      return {
        ...emptyClaimReturn,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    const pendingModel = task.pendingTurn.model;
    if (pendingModel !== undefined) {
      const claimModel = normalizeAIModel(args.model);
      if (normalizeAIModel(pendingModel) !== claimModel) {
        return {
          ...emptyClaimReturn,
          stopTaskToolUseIds,
          cancelRequested,
          usageRefreshRequested,
        };
      }
    }

    // A daemon built before `acceptTurn` cannot hold a lease. Leave the turn
    // staged: prewarm replaces the stale daemon, and the new one claims it.
    if (args.acceptTurn === undefined) {
      return {
        ...emptyClaimReturn,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }
    // Every chat workflow stages a turn id. A slot without one cannot hold a
    // lease, so drop it rather than run it unfenced.
    const pendingTurnId = task.pendingTurn.turnId;
    const claim =
      pendingTurnId === undefined
        ? null
        : await claimStagedTurn(ctx, pendingTurnId);
    if (claim?.status !== "leased") {
      if (claim === null || claim.status === "drop") {
        await ctx.db.patch(args.taskId, { pendingTurn: undefined });
      }
      return {
        ...emptyClaimReturn,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    const prompt = task.pendingTurn.prompt;
    const attachmentUrls = await resolveStorageUrls(
      (id) => ctx.storage.getUrl(id),
      task.pendingTurn.attachmentStorageIds,
    );
    await ctx.db.patch(args.taskId, { pendingTurn: undefined });
    const claimedTurn = {
      prompt,
      attachmentUrls,
      stopTaskToolUseIds,
      cancelRequested,
      usageRefreshRequested,
    };
    const turnLifecycle = "durable" as const;
    return { ...claimedTurn, turnLifecycle, ...claim.lease };
  },
});

export const updateBackgroundAgents = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    agents: v.array(backgroundAgentEntryValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (
      !task.repoId ||
      !(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))
    ) {
      throw new Error("Not authorized");
    }
    if (args.agents.length === 0) return null;
    const backgroundAgents = mergeBackgroundAgents(
      task.backgroundAgents,
      args.agents,
    );
    await ctx.db.patch(args.taskId, {
      backgroundAgents,
      updatedAt: Date.now(),
    });
    // See the session copy: settling is the one queue release the surface
    // never signals on its own.
    await scheduleQueueDrainAfterBackgroundAgents(
      ctx,
      args.taskId,
      backgroundAgents,
    );
    return null;
  },
});

export const requestStopBackgroundAgent = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    toolUseId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (
      !task.repoId ||
      !(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))
    ) {
      throw new Error("Not authorized");
    }
    const pending = task.pendingTaskStops ?? [];
    if (pending.includes(args.toolUseId)) return null;
    await ctx.db.patch(args.taskId, {
      pendingTaskStops: [...pending, args.toolUseId],
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const openSyntheticTurn = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    // The daemon's own model. Optional only for daemons launched before the
    // field existed; those fall back to the sticky pick, which the picker can
    // move mid-flight and may therefore mis-attribute the checkpoint.
    model: v.optional(aiModelValidator),
  },
  returns: v.object({
    messageId: v.id("messages"),
    turnId: v.id("turns"),
    leaseGeneration: v.number(),
  }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (
      !task.repoId ||
      !(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))
    ) {
      throw new Error("Not authorized");
    }
    const turnModel = normalizeAIModel(
      args.model ?? task.lastChatModel ?? task.model,
    );
    const messageId = await ctx.db.insert("messages", {
      parentId: args.taskId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      activityLog: "",
      isSyntheticTurn: true,
      // Stamped at open time because the daemon protocol carries no model on
      // completion. Not yet a checkpoint — that needs `finishedAt` too — and
      // `completeSyntheticTurn` clears it again if the turn fails.
      model: turnModel,
    });
    const turnId = await openChatTurn(ctx, {
      entityId: args.taskId,
      streamingEntityId: taskChatStreamEntityId(args.taskId),
      placeholderMessageId: messageId,
      prompt: "[synthetic continuation]",
      model: turnModel,
      sandboxId: task.sandboxId,
      repoId: task.repoId,
    });
    const lease = await leaseSyntheticTurn(ctx, turnId);
    await ctx.db.patch(args.taskId, {
      syntheticTurnMessageId: messageId,
      updatedAt: Date.now(),
    });
    return { messageId, ...lease };
  },
});

export const completeSyntheticTurn = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    messageId: v.id("messages"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    pendingQuestion: v.optional(v.string()),
    ...turnLeaseFenceArgs,
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turnResolution = await resolveCompletionTurn(ctx, {
      entityId: args.taskId,
      turnId: args.turnId,
      leaseGeneration: args.leaseGeneration,
      placeholderMessageId: args.messageId,
    });
    if (turnResolution.status === "stale") return null;
    if (turnResolution.status === "current") {
      await advanceTurn(ctx, turnResolution.turn, "finalizing");
    }
    await clearStreamingActivity(ctx, taskChatStreamEntityId(args.taskId));

    const message = await ctx.db.get(args.messageId);
    if (
      !message ||
      message.parentId !== args.taskId ||
      message.finishedAt !== undefined
    ) {
      await ctx.db.patch(args.taskId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      if (turnResolution.status === "current") {
        await closeTurn(ctx, turnResolution.turn, "error", {
          error: "Synthetic turn placeholder was no longer available",
        });
      }
      await startNextQueuedTaskChatMessage(ctx, args.taskId);
      return null;
    }

    const patch = syntheticTurnCompletionPatch(args);
    await ctx.db.patch(args.messageId, patch);
    // Judged out of band; a turn that changed no code schedules nothing.
    await scheduleScopeCheck(ctx, {
      _id: args.messageId,
      beforeSha: patch.beforeSha,
      afterSha: patch.afterSha,
    });

    await ctx.db.patch(args.taskId, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    if (turnResolution.status === "current") {
      await closeTurn(
        ctx,
        turnResolution.turn,
        args.success ? "done" : "error",
        args.error ? { error: args.error } : {},
      );
    }
    await startNextQueuedTaskChatMessage(ctx, args.taskId);
    return null;
  },
});


/** Re-stages pendingTurn when cancel raced with startExecute. */
export const ensurePendingTurn = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    prompt: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    model: v.optional(aiModelValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    if (
      args.model !== undefined &&
      !usesChatDaemon(normalizeAIModel(args.model))
    ) {
      return null;
    }
    // The lease decides: a claimed turn has a daemon on it, and restaging
    // would run it twice. Same rule as the session `ensurePendingTurn`.
    const openTurn = await findOpenTurn(ctx, args.taskId);
    if (!openTurn || isTurnClaimed(openTurn)) return null;
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.taskId))
      .order("desc")
      .first();
    if (
      !isUnclaimedOpenTurn({
        // A slot staged for an already-closed turn is an orphan, not a live
        // turn: leaving it would block this restage until the lease expires.
        hasPendingTurn: isPendingTurnLive({
          pendingTurn: task.pendingTurn,
          openTurnId: openTurn._id,
        }),
        lastAssistant: last,
      })
    ) {
      return null;
    }
    await ctx.db.patch(args.taskId, {
      pendingTurn: {
        prompt: args.prompt,
        requestedAt: Date.now(),
        turnId: openTurn._id,
        attachmentStorageIds: args.attachmentStorageIds,
        ...(args.model !== undefined
          ? { model: normalizeAIModel(args.model) }
          : {}),
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});
