import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { authMutation, hasRepoAccess } from "../functions";
import {
  aiModelValidator,
  normalizeAIModel,
  turnCheckpointArgs,
  usesChatDaemon,
} from "../validators";
import { backgroundAgentEntryValidator } from "../_validators/tableFields";
import { mergeBackgroundAgents } from "../_sessions/backgroundAgents";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { finalizeCancelledAssistantMessage } from "../streaming";
import {
  scheduleQueueDrainAfterBackgroundAgents,
  startNextQueuedTaskChatMessage,
} from "../_queues/helpers";
import { TASK_CHAT_STREAM_PREFIX } from "../workflowWatchdog";
import { isDaemonClaimPaused } from "./daemonClaimPause";
import { pendingTurnAlreadyClaimed } from "./pendingTurnRestage";
import { resolveStorageUrls } from "./storageUrls";

function taskChatStreamEntityId(taskId: Id<"agentTasks">): string {
  return `${TASK_CHAT_STREAM_PREFIX}${String(taskId)}`;
}

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
  returns: v.object({
    prompt: v.union(v.string(), v.null()),
    turnLifecycle: v.literal("legacy"),
    attachmentUrls: v.array(v.string()),
    stopTaskToolUseIds: v.array(v.string()),
    cancelRequested: v.boolean(),
    usageRefreshRequested: v.boolean(),
  }),
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

    const prompt = task.pendingTurn.prompt;
    const attachmentUrls = await resolveStorageUrls(
      (id) => ctx.storage.getUrl(id),
      task.pendingTurn.attachmentStorageIds,
    );
    // The stamp is what tells `ensurePendingTurn` this prompt left
    // `pendingTurn` via a claim rather than a cancel. See
    // `pendingTurnRestage.ts` for the duplicate-run incident it prevents.
    await ctx.db.patch(args.taskId, {
      pendingTurn: undefined,
      pendingTurnClaimedAt: Date.now(),
    });
    const turnLifecycle = "legacy" as const;
    return {
      prompt,
      turnLifecycle,
      attachmentUrls,
      stopTaskToolUseIds,
      cancelRequested,
      usageRefreshRequested,
    };
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
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (
      !task.repoId ||
      !(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))
    ) {
      throw new Error("Not authorized");
    }
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
      model: normalizeAIModel(args.model ?? task.lastChatModel ?? task.model),
    });
    await ctx.db.patch(args.taskId, {
      syntheticTurnMessageId: messageId,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.agentTaskChatWorkflow.handleStaleSyntheticTurn,
      { taskId: args.taskId, messageId },
    );
    return { messageId };
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
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
      await startNextQueuedTaskChatMessage(ctx, args.taskId);
      return null;
    }

    const patch: {
      content: string;
      activityLog?: string;
      finishedAt: number;
      pendingQuestion?: string;
      model?: Doc<"messages">["model"];
    } = {
      content: args.success
        ? args.result || "I couldn't process your message."
        : `Error: ${args.error || "Unknown error during execution."}`,
      finishedAt: Date.now(),
    };
    if (args.activityLog) patch.activityLog = args.activityLog;
    if (args.pendingQuestion) patch.pendingQuestion = args.pendingQuestion;
    // Drops the open-time stamp so a failed turn never becomes a checkpoint.
    if (!args.success) {
      patch.model = undefined;
    }
    await ctx.db.patch(args.messageId, patch);

    await ctx.db.patch(args.taskId, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    await startNextQueuedTaskChatMessage(ctx, args.taskId);
    return null;
  },
});

export const handleStaleSyntheticTurn = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.syntheticTurnMessageId !== args.messageId) {
      return null;
    }
    const message = await ctx.db.get(args.messageId);
    if (!message || message.finishedAt !== undefined) {
      await ctx.db.patch(args.taskId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      return null;
    }
    const streamingEntityId = taskChatStreamEntityId(args.taskId);
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
      .first();
    const streamingStale =
      streaming === null ||
      Date.now() - (streaming.lastUpdatedAt ?? 0) > 2 * 60 * 1000;
    if (!streamingStale) {
      await ctx.scheduler.runAfter(
        10 * 60 * 1000,
        internal.agentTaskChatWorkflow.handleStaleSyntheticTurn,
        { taskId: args.taskId, messageId: args.messageId },
      );
      return null;
    }
    await finalizeCancelledAssistantMessage(ctx, message, streaming);
    await clearStreamingActivity(ctx, streamingEntityId);
    await ctx.db.patch(args.taskId, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
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
    if (!task || task.pendingTurn) return null;
    if (
      args.model !== undefined &&
      !usesChatDaemon(normalizeAIModel(args.model))
    ) {
      return null;
    }
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.taskId))
      .order("desc")
      .first();
    if (
      !last ||
      last.role !== "assistant" ||
      last.finishedAt !== undefined ||
      last.isSyntheticTurn === true
    ) {
      return null;
    }
    // An open placeholder also describes a turn the daemon has already claimed
    // and is running. Re-staging there parks a duplicate prompt for the whole
    // turn, which a prewarm-respawned daemon then runs a second time.
    if (
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: task.pendingTurnClaimedAt,
        placeholderTimestamp: last.timestamp,
      })
    ) {
      return null;
    }
    await ctx.db.patch(args.taskId, {
      pendingTurn: {
        prompt: args.prompt,
        requestedAt: Date.now(),
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
