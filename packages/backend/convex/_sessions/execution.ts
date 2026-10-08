import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { workflow, cancelTrackedWorkflow } from "../workflowManager";
import { authAction, authMutation, hasRepoAccess } from "../functions";
import {
  aiModelValidator,
  normalizeAIModel,
  reasoningLevelValidator,
  usesChatDaemon,
} from "../validators";
import { trackSessionWorkflow } from "../workflowWatchdog";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { finalizeCancelledAssistantMessage } from "../streaming";
import { drainSessionChatQueues } from "../_queues/helpers";
import { buildSessionPrompt, sessionTurnTools } from "./workflow";
import { resolveTurnProviderAccountId } from "../_userProviderAccounts/defaults";
import type { Doc, Id } from "../_generated/dataModel";
import { notifyChatMentions } from "../_mentions/notifyChatMentions";
import { maybeInsertModelHandoffAlert } from "../_shared/modelHandoff";
import {
  bindTurnWorkflow,
  closeOpenChatTurn,
  closeTurnForWorkflow,
  openChatTurn,
} from "../_chat/turnStore";
import {
  countStallAlertsAfterLastUser,
  shouldRetryEmptyStall,
} from "../_chat/stallRetry";
import {
  getSessionChatOrThrow,
  listLiveSessionChats,
  loadSessionChat,
  sessionChatHasFreeSlot,
  sessionChatPersistenceId,
  sessionChatStreamingEntityId,
  type SessionChatContext,
} from "../_sessionChats/helpers";

/** Composer settings a turn carries; stored on the chat when it is staged. */
type TurnSettings = {
  model: Doc<"turns">["model"];
  reasoningLevel?: Doc<"sessionChats">["lastReasoningLevel"];
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
  providerAccountId?: Id<"userProviderAccounts">;
  attachmentStorageIds?: Id<"_storage">[];
};

const turnSettingsArgs = {
  model: aiModelValidator,
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
};

function stickyTraitPatch(settings: TurnSettings) {
  return {
    ...(settings.reasoningLevel !== undefined
      ? { lastReasoningLevel: settings.reasoningLevel }
      : {}),
    ...(settings.thinkingEnabled !== undefined
      ? { lastThinkingEnabled: settings.thinkingEnabled }
      : {}),
    ...(settings.use1mContext !== undefined
      ? { lastUse1mContext: settings.use1mContext }
      : {}),
    ...(settings.fastMode !== undefined
      ? { lastFastMode: settings.fastMode }
      : {}),
  };
}

async function finalizeOpenSyntheticTurnOnCancel(
  ctx: MutationCtx,
  syntheticTurnMessageId: Id<"messages"> | undefined,
  streaming: Doc<"streamingActivity"> | null,
): Promise<void> {
  if (syntheticTurnMessageId === undefined) return;
  const syntheticMessage = await ctx.db.get(syntheticTurnMessageId);
  if (syntheticMessage && syntheticMessage.finishedAt === undefined) {
    await finalizeCancelledAssistantMessage(ctx, syntheticMessage, streaming);
  }
}

/** Stages a prompt for the warm daemon, opens the durable turn and starts the workflow. */
async function stageAndStartChatTurn(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    repo: Doc<"githubRepos">;
    actingUserId: Id<"users">;
    message: string;
    settings: TurnSettings;
  },
): Promise<void> {
  const { chat, session } = params.context;
  const { settings } = params;
  const stickyProviderAccountId = await resolveTurnProviderAccountId(ctx.db, {
    requestedAccountId: settings.providerAccountId,
    ownerUserId: session.createdBy ?? session.userId,
    model: settings.model,
    changePolicy: "owner-pool",
  });
  const credentialOwnerUserId = session.createdBy ?? session.userId;
  const streamingEntityId = sessionChatStreamingEntityId(chat._id);

  await clearStreamingActivity(ctx, streamingEntityId);

  const placeholderMessageId = await ctx.db.insert("messages", {
    parentId: chat._id,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    activityLog: "",
  });

  const user = await ctx.db.get(params.actingUserId);
  const { prompt } = await buildSessionPrompt(ctx, {
    session,
    chat,
    repo: params.repo,
    user,
    message: params.message,
    model: settings.model,
  });

  const normalizedModel = normalizeAIModel(settings.model);
  const usesDaemonPull = usesChatDaemon(normalizedModel);
  const turnId = await openChatTurn(ctx, {
    chatId: chat._id,
    sessionId: session._id,
    streamingEntityId,
    placeholderMessageId,
    prompt,
    attachmentStorageIds: settings.attachmentStorageIds,
    model: normalizedModel,
    sandboxId: session.sandboxId,
    repoId: session.repoId,
  });
  const pendingTurn = usesDaemonPull
    ? {
        prompt,
        requestedAt: Date.now(),
        turnId,
        attachmentStorageIds: settings.attachmentStorageIds,
        model: normalizedModel,
      }
    : undefined;
  const now = Date.now();
  await ctx.db.patch(chat._id, {
    pendingTurn,
    providerAccountId: stickyProviderAccountId,
    lastModel: normalizedModel,
    ...stickyTraitPatch(settings),
    updatedAt: now,
  });
  await ctx.db.patch(session._id, { updatedAt: now });

  if (usesDaemonPull && session.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmSessionDaemon, {
      sandboxId: session.sandboxId,
      chatId: chat._id,
      repoId: session.repoId,
      userId: params.actingUserId,
      model: normalizedModel,
      reasoningLevel: settings.reasoningLevel,
      thinkingEnabled: settings.thinkingEnabled,
      use1mContext: settings.use1mContext,
      fastMode: settings.fastMode,
      ...sessionTurnTools(session.isOrchestrator),
      providerAccountId: stickyProviderAccountId,
      credentialOwnerUserId,
      sessionPersistenceId: sessionChatPersistenceId(chat),
    });
  }

  const workflowId = await workflow.start(
    ctx,
    internal.sessionWorkflow.sessionExecuteWorkflow,
    {
      chatId: chat._id,
      message: params.message,
      model: settings.model,
      reasoningLevel: settings.reasoningLevel,
      thinkingEnabled: settings.thinkingEnabled,
      use1mContext: settings.use1mContext,
      fastMode: settings.fastMode,
      providerAccountId: stickyProviderAccountId,
      credentialOwnerUserId,
      userId: params.actingUserId,
      installationId: params.repo.installationId,
      turnId,
    },
  );

  await bindTurnWorkflow(ctx, turnId, String(workflowId));
  await trackSessionWorkflow(ctx, chat._id, workflowId);
}

/** Parks a message on the chat's queue; the next drain starts it. */
async function enqueueChatMessage(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    userId: Id<"users">;
    content: string;
    displayContent?: string;
    settings: TurnSettings;
    sentViaOrchestrator?: boolean;
  },
): Promise<void> {
  const { chat, session } = params.context;
  const { settings } = params;
  const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
    requestedAccountId: settings.providerAccountId,
    ownerUserId: session.createdBy ?? session.userId,
    model: settings.model,
    changePolicy: "owner-pool",
  });
  const now = Date.now();
  await ctx.db.insert("queuedMessages", {
    parentId: chat._id,
    content: params.content,
    displayContent: params.displayContent,
    createdAt: now,
    order: now,
    userId: params.userId,
    model: settings.model,
    reasoningLevel: settings.reasoningLevel,
    thinkingEnabled: settings.thinkingEnabled,
    use1mContext: settings.use1mContext,
    fastMode: settings.fastMode,
    providerAccountId,
    attachmentStorageIds: settings.attachmentStorageIds,
    sentViaOrchestrator: params.sentViaOrchestrator,
  });
  await ctx.db.patch(chat._id, {
    lastModel: settings.model,
    providerAccountId,
    ...stickyTraitPatch(settings),
    updatedAt: now,
  });
  await ctx.db.patch(session._id, { updatedAt: now });
}

/**
 * Restage the last user prompt after an empty stall so the question is not
 * lost. No new user bubble — the original message stays, a new placeholder
 * opens below the stall alert. One shot: a second stall of the same prompt
 * stays failed.
 */
export const retryEmptyStalledSessionTurn = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    turnId: v.id("turns"),
    sandboxStopped: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadSessionChat(ctx.db, args.chatId);
    const turn = await ctx.db.get(args.turnId);
    if (!context || !turn) return null;
    const { chat, session } = context;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
      .order("desc")
      .take(20);
    const counted = countStallAlertsAfterLastUser(messages);
    if (
      !shouldRetryEmptyStall({
        sandboxStopped: args.sandboxStopped,
        hasActiveWorkflow: chat.activeWorkflowId !== undefined,
        stallAlertsAfterLastUser: counted.stallAlertsAfterLastUser,
        lastUserContent: counted.lastUserContent,
        hasSalvagedOutput: counted.hasSalvagedOutput,
      })
    ) {
      return null;
    }
    const lastUserContent = counted.lastUserContent;
    if (lastUserContent === undefined) return null;

    const repo = await ctx.db.get(session.repoId);
    if (!repo) return null;

    const actingUserId = session.createdBy ?? session.userId;
    await stageAndStartChatTurn(ctx, {
      context,
      repo,
      actingUserId,
      message: lastUserContent,
      settings: {
        model: turn.model,
        reasoningLevel: chat.lastReasoningLevel,
        thinkingEnabled: chat.lastThinkingEnabled,
        use1mContext: chat.lastUse1mContext,
        fastMode: chat.lastFastMode,
        providerAccountId: chat.providerAccountId,
        attachmentStorageIds: turn.attachmentStorageIds,
      },
    });
    console.log(
      `[sessions] retryEmptyStalledSessionTurn chatId=${args.chatId} turnId=${args.turnId}`,
    );
    return null;
  },
});

/**
 * Frontend trigger to start a chat turn. When the session already has
 * `MAX_PARALLEL_CHATS` sibling chats running, the message queues on this chat
 * instead and starts when a sibling finishes; the reply says which happened
 * so the composer can show "waiting for a free slot".
 */
export const startExecute = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    message: v.string(),
    ...turnSettingsArgs,
  },
  returns: v.union(v.literal("started"), v.literal("queued")),
  handler: async (ctx, args) => {
    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    const { chat, session } = context;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    if (chat.archived === true) throw new Error("This chat is closed");

    // Notify before the turn runs or queues so a mention fires either way.
    await notifyChatMentions(ctx, {
      content: args.message,
      authorUserId: ctx.userId,
      surface: { kind: "session", session },
    });

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    const { chatId, message, ...settings } = args;
    void chatId;
    if (!(await sessionChatHasFreeSlot(ctx.db, context))) {
      await enqueueChatMessage(ctx, {
        context,
        userId: ctx.userId,
        content: message,
        settings,
      });
      // The composer already inserted the user row (addMessage); drop it so
      // the queue drain's own insert does not show the prompt twice.
      const last = await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
        .order("desc")
        .first();
      if (last && last.role === "user" && last.content === message) {
        await ctx.db.delete(last._id);
      }
      return "queued";
    }

    // Daemon-pull dispatch: stage the turn for a warm daemon to claim in one
    // poll instead of waiting on the workflow's durable step queue. The user
    // row is already stored (the client sends addMessage first), so handoff
    // detection sees it and posts its alert above the new placeholder.
    await maybeInsertModelHandoffAlert(
      ctx,
      chat._id,
      settings.model,
      chat.provider,
    );

    await stageAndStartChatTurn(ctx, {
      context,
      repo,
      actingUserId: ctx.userId,
      message,
      settings,
    });
    return "started";
  },
});

/**
 * Fired when a chat tab opens: boot its daemon ahead of the user's first
 * message so that message is warm instead of paying a ~20s cold respawn.
 * No-op unless the session already has a sandbox and uses a daemon provider.
 * Best-effort and cheap to call repeatedly (the action skips if already warm).
 */
export const prewarmDaemon = authMutation({
  args: { chatId: v.id("sessionChats") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadSessionChat(ctx.db, args.chatId);
    if (!context) return null;
    const { chat, session } = context;
    const sandboxId = session.sandboxId;
    if (!sandboxId) return null;
    // Never prewarm a stopped/stopping session. prewarmSessionDaemon execs on
    // the sandbox, and on Vercel any exec lazily resumes a stopped VM (SDK
    // withResume) — resurrecting a sandbox the user stopped, invisibly (the
    // session status stays "closed"). A closed session keeps its sandboxId, so
    // without this guard merely opening its page wakes the VM behind the
    // user's back.
    if (session.status === "closed" || session.status === "stopping")
      return null;
    if (chat.archived === true) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    // Match the turn path's launch options so the first real message does not
    // immediately optsmismatch-kill this daemon (which races with
    // claimPendingTurn and leaves the chat stuck on Working). Traits must be
    // forwarded for the same reason.
    const credentialOwnerUserId = session.createdBy ?? session.userId;
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmSessionDaemon, {
      sandboxId,
      chatId: chat._id,
      repoId: session.repoId,
      userId: session.userId,
      model: normalizeAIModel(chat.lastModel),
      reasoningLevel: chat.lastReasoningLevel,
      thinkingEnabled: chat.lastThinkingEnabled,
      use1mContext: chat.lastUse1mContext,
      fastMode: chat.lastFastMode,
      ...sessionTurnTools(session.isOrchestrator),
      providerAccountId: chat.providerAccountId,
      credentialOwnerUserId,
      sessionPersistenceId: sessionChatPersistenceId(chat),
    });
    return null;
  },
});

/**
 * Waits for account-switch prewarming to finish before the composer is
 * re-enabled, preventing the previous credential daemon from claiming the next
 * turn during its replacement window.
 */
export const prewarmDaemonNow = authAction({
  args: { chatId: v.id("sessionChats") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.sessionWorkflow.getDaemonPrewarmData,
      { chatId: args.chatId, userId: ctx.userId },
    );
    if (!data) return null;
    await ctx.runAction(internal.sandbox.prewarmSessionDaemon, {
      sandboxId: data.sandboxId,
      chatId: args.chatId,
      repoId: data.repoId,
      userId: data.ownerUserId,
      model: data.model,
      reasoningLevel: data.reasoningLevel,
      thinkingEnabled: data.thinkingEnabled,
      use1mContext: data.use1mContext,
      fastMode: data.fastMode,
      ...sessionTurnTools(data.isOrchestrator),
      providerAccountId: data.providerAccountId,
      credentialOwnerUserId: data.credentialOwnerUserId,
      sessionPersistenceId: data.sessionPersistenceId,
    });
    return null;
  },
});

export const getDaemonPrewarmData = internalQuery({
  args: {
    chatId: v.id("sessionChats"),
    userId: v.id("users"),
  },
  returns: v.union(
    v.null(),
    v.object({
      sandboxId: v.string(),
      repoId: v.id("githubRepos"),
      ownerUserId: v.id("users"),
      credentialOwnerUserId: v.id("users"),
      model: aiModelValidator,
      reasoningLevel: v.optional(reasoningLevelValidator),
      thinkingEnabled: v.optional(v.boolean()),
      use1mContext: v.optional(v.boolean()),
      fastMode: v.optional(v.boolean()),
      providerAccountId: v.optional(v.id("userProviderAccounts")),
      /** Selects the master's reduced tool set — see `sessionTurnTools`. */
      isOrchestrator: v.optional(v.boolean()),
      sessionPersistenceId: v.union(v.id("sessions"), v.id("sessionChats")),
    }),
  ),
  handler: async (ctx, args) => {
    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    const { chat, session } = context;
    if (!(await hasRepoAccess(ctx.db, session.repoId, args.userId))) {
      throw new Error("Not authorized");
    }
    if (
      !session.sandboxId ||
      session.status === "closed" ||
      session.status === "stopping" ||
      chat.archived === true
    ) {
      return null;
    }
    return {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      ownerUserId: session.userId,
      credentialOwnerUserId: session.createdBy ?? session.userId,
      model: normalizeAIModel(chat.lastModel),
      reasoningLevel: chat.lastReasoningLevel,
      thinkingEnabled: chat.lastThinkingEnabled,
      use1mContext: chat.lastUse1mContext,
      fastMode: chat.lastFastMode,
      providerAccountId: chat.providerAccountId,
      isOrchestrator: session.isOrchestrator,
      sessionPersistenceId: sessionChatPersistenceId(chat),
    };
  },
});

/** Queues a message to be processed after the chat's current turn finishes. */
export const enqueueMessage = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    message: v.string(),
    /** Compact chat-display text when `message` is a rich agent prompt. */
    displayContent: v.optional(v.string()),
    ...turnSettingsArgs,
    /** Set by the orchestrator's `send_agent_message` MCP tool. */
    sentViaOrchestrator: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const content = args.message.trim();
    if (!content) return null;
    const displayContent = args.displayContent?.trim();

    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    const { session } = context;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    await notifyChatMentions(ctx, {
      content: displayContent || content,
      authorUserId: ctx.userId,
      surface: { kind: "session", session },
    });

    const {
      chatId,
      message,
      displayContent: omittedDisplay,
      sentViaOrchestrator,
      ...settings
    } = args;
    void chatId;
    void message;
    void omittedDisplay;
    await enqueueChatMessage(ctx, {
      context,
      userId: ctx.userId,
      content,
      displayContent: displayContent || undefined,
      settings,
      sentViaOrchestrator,
    });
    return null;
  },
});

/**
 * Cancels one chat's active turn and starts its queued messages. For a
 * daemon-backed turn, sets `cancelRequestedAt` so the warm provider process
 * interrupts its own in-flight turn on its next `claimPendingTurn` poll.
 * One-shot providers retain the process-kill path.
 */
export async function cancelChatExecution(
  ctx: MutationCtx,
  context: SessionChatContext,
): Promise<void> {
  const { chat, session } = context;
  const streamingEntityId = sessionChatStreamingEntityId(chat._id);

  // Snapshot what this cancel owns. A concurrent startExecute may stage a
  // newer pendingTurn / activeWorkflowId while we run — must not clear those
  // or mark the newer assistant placeholder as cancelled.
  const workflowIdToCancel = chat.activeWorkflowId;
  const pendingRequestedAt = chat.pendingTurn?.requestedAt;

  await cancelTrackedWorkflow(ctx, workflowIdToCancel);

  if (usesChatDaemon(normalizeAIModel(chat.lastModel))) {
    await ctx.db.patch(chat._id, { cancelRequestedAt: Date.now() });
  } else if (session.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
  }

  if (workflowIdToCancel !== undefined) {
    await closeTurnForWorkflow(ctx, chat._id, workflowIdToCancel, "cancelled", {
      error: "Cancelled by the user",
    });
  }

  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
    .first();

  const latest = await ctx.db.get(chat._id);
  if (!latest) return;

  const newerTurnStaged =
    latest.pendingTurn !== undefined &&
    latest.pendingTurn.requestedAt !== pendingRequestedAt;
  const newerWorkflowTracked =
    latest.activeWorkflowId !== undefined &&
    latest.activeWorkflowId !== workflowIdToCancel;

  if (!newerTurnStaged && !newerWorkflowTracked) {
    const syntheticTurnMessageId = latest.syntheticTurnMessageId;
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
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
    await finalizeOpenSyntheticTurnOnCancel(
      ctx,
      syntheticTurnMessageId,
      streaming,
    );
    await closeOpenChatTurn(ctx, chat._id, "cancelled", {
      error: "Cancelled by the user",
    });
  }

  await clearStreamingActivity(ctx, streamingEntityId);

  const chatPatch: {
    activeWorkflowId?: undefined;
    pendingTurn?: undefined;
    syntheticTurnMessageId?: undefined;
    updatedAt: number;
  } = { updatedAt: Date.now() };

  if (
    workflowIdToCancel !== undefined &&
    latest.activeWorkflowId === workflowIdToCancel
  ) {
    chatPatch.activeWorkflowId = undefined;
  }
  if (
    pendingRequestedAt !== undefined &&
    latest.pendingTurn?.requestedAt === pendingRequestedAt
  ) {
    chatPatch.pendingTurn = undefined;
  }
  if (!newerTurnStaged && !newerWorkflowTracked) {
    chatPatch.syntheticTurnMessageId = undefined;
  }

  await ctx.db.patch(chat._id, chatPatch);
  await drainSessionChatQueues(ctx, session._id, chat._id);
}

export const cancelExecution = authMutation({
  args: { chatId: v.id("sessionChats") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, context.session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    await cancelChatExecution(ctx, context);
    return null;
  },
});

/** Stops every chat of a session at once (the fleet `stop_agent` tool). */
export const cancelSessionExecution = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    for (const chat of await listLiveSessionChats(ctx.db, session._id)) {
      await cancelChatExecution(ctx, { chat, session });
    }
    return null;
  },
});
