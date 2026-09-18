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
  startNextQueuedProjectChatMessage,
} from "../_queues/helpers";
import { PROJECT_CHAT_STREAM_PREFIX } from "../workflowWatchdog";
import { isDaemonClaimPaused } from "./daemonClaimPause";
import { pendingTurnAlreadyClaimed } from "./pendingTurnRestage";
import { resolveStorageUrls } from "./storageUrls";

function projectChatStreamEntityId(projectId: Id<"projects">): string {
  return `${PROJECT_CHAT_STREAM_PREFIX}${String(projectId)}`;
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

/** Daemon-pull turn claim for project sandbox chat. */
export const claimPendingTurn = authMutation({
  args: {
    projectId: v.id("projects"),
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
    const project = await ctx.db.get(args.projectId);
    if (!project) return emptyClaimReturn;
    // Daemon polls ~20×/s — skip team-membership join for the project owner.
    if (project.userId !== ctx.userId) {
      if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
    }
    // Stops must drain unconditionally: a backgrounded agent outlives the chat
    // turn, and saveResult clears activeChatWorkflowId the moment the visible
    // turn finishes — gating the drain there would strand stop requests.
    const stopTaskToolUseIds = project.pendingTaskStops ?? [];
    if (stopTaskToolUseIds.length > 0) {
      await ctx.db.patch(args.projectId, { pendingTaskStops: undefined });
    }

    // Cancel requests must drain the same way: the daemon polls this mutation
    // mid-turn specifically to notice an interrupt, so gating on
    // activeChatWorkflowId/pendingTurn below would strand the signal.
    const cancelRequested = project.cancelRequestedAt !== undefined;
    if (cancelRequested) {
      await ctx.db.patch(args.projectId, { cancelRequestedAt: undefined });
    }

    // Level-triggered until the refresh action clears it — old callbacks must
    // not consume the chip's request as a no-op.
    const usageRefreshRequested = project.usageRefreshRequestedAt !== undefined;

    // A prewarm is killing this daemon right now. See the session copy in
    // `_sessions/workflow.ts`: claiming here strands the turn on a dying
    // process. Placed after the drains so a cancel is never stranded.
    if (
      isDaemonClaimPaused({
        claimPausedUntil: project.claimPausedUntil,
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

    // Chat daemon only — never claim a turn while another workflow is the only
    // active consumer.
    if (!project.activeChatWorkflowId) {
      return {
        ...emptyClaimReturn,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    if (!project.pendingTurn) {
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

    const pendingModel = project.pendingTurn.model;
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

    const prompt = project.pendingTurn.prompt;
    const attachmentUrls = await resolveStorageUrls(
      (id) => ctx.storage.getUrl(id),
      project.pendingTurn.attachmentStorageIds,
    );
    // The stamp is what tells `ensurePendingTurn` this prompt left
    // `pendingTurn` via a claim rather than a cancel. See
    // `pendingTurnRestage.ts` for the duplicate-run incident it prevents.
    await ctx.db.patch(args.projectId, {
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
    projectId: v.id("projects"),
    agents: v.array(backgroundAgentEntryValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (args.agents.length === 0) return null;
    const backgroundAgents = mergeBackgroundAgents(
      project.backgroundAgents,
      args.agents,
    );
    await ctx.db.patch(args.projectId, {
      backgroundAgents,
      updatedAt: Date.now(),
      lastSandboxActivity: Date.now(),
    });
    // See the session copy: settling is the one queue release the surface
    // never signals on its own.
    await scheduleQueueDrainAfterBackgroundAgents(
      ctx,
      args.projectId,
      backgroundAgents,
    );
    return null;
  },
});

export const requestStopBackgroundAgent = authMutation({
  args: {
    projectId: v.id("projects"),
    toolUseId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const pending = project.pendingTaskStops ?? [];
    if (pending.includes(args.toolUseId)) return null;
    await ctx.db.patch(args.projectId, {
      pendingTaskStops: [...pending, args.toolUseId],
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const openSyntheticTurn = authMutation({
  args: {
    projectId: v.id("projects"),
    // The daemon's own model. Optional only for daemons launched before the
    // field existed; those fall back to the sticky pick, which the picker can
    // move mid-flight and may therefore mis-attribute the checkpoint.
    model: v.optional(aiModelValidator),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const messageId = await ctx.db.insert("messages", {
      parentId: args.projectId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      activityLog: "",
      isSyntheticTurn: true,
      // Stamped at open time because the daemon protocol carries no model on
      // completion. Not yet a checkpoint — that needs `finishedAt` too — and
      // `completeSyntheticTurn` clears it again if the turn fails.
      model: normalizeAIModel(
        args.model ?? project.lastChatModel ?? project.model,
      ),
    });
    await ctx.db.patch(args.projectId, {
      syntheticTurnMessageId: messageId,
      updatedAt: Date.now(),
      lastSandboxActivity: Date.now(),
    });
    await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.projectChatWorkflow.handleStaleSyntheticTurn,
      { projectId: args.projectId, messageId },
    );
    return { messageId };
  },
});

export const completeSyntheticTurn = authMutation({
  args: {
    projectId: v.id("projects"),
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
    await clearStreamingActivity(
      ctx,
      projectChatStreamEntityId(args.projectId),
    );

    const message = await ctx.db.get(args.messageId);
    if (
      !message ||
      message.parentId !== args.projectId ||
      message.finishedAt !== undefined
    ) {
      await ctx.db.patch(args.projectId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      await startNextQueuedProjectChatMessage(ctx, args.projectId);
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

    await ctx.db.patch(args.projectId, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
      lastSandboxActivity: Date.now(),
    });
    await startNextQueuedProjectChatMessage(ctx, args.projectId);
    return null;
  },
});

export const handleStaleSyntheticTurn = internalMutation({
  args: {
    projectId: v.id("projects"),
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.syntheticTurnMessageId !== args.messageId) {
      return null;
    }
    const message = await ctx.db.get(args.messageId);
    if (!message || message.finishedAt !== undefined) {
      await ctx.db.patch(args.projectId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      return null;
    }
    const streamingEntityId = projectChatStreamEntityId(args.projectId);
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
        internal.projectChatWorkflow.handleStaleSyntheticTurn,
        { projectId: args.projectId, messageId: args.messageId },
      );
      return null;
    }
    await finalizeCancelledAssistantMessage(ctx, message, streaming);
    await clearStreamingActivity(ctx, streamingEntityId);
    await ctx.db.patch(args.projectId, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    await startNextQueuedProjectChatMessage(ctx, args.projectId);
    return null;
  },
});

export const ensurePendingTurn = internalMutation({
  args: {
    projectId: v.id("projects"),
    prompt: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    model: v.optional(aiModelValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.pendingTurn) return null;
    if (
      args.model !== undefined &&
      !usesChatDaemon(normalizeAIModel(args.model))
    ) {
      return null;
    }
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.projectId))
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
        pendingTurnClaimedAt: project.pendingTurnClaimedAt,
        placeholderTimestamp: last.timestamp,
      })
    ) {
      return null;
    }
    await ctx.db.patch(args.projectId, {
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
