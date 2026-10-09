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
  launchTraitsFromStored,
  normalizeAIModel,
  reasoningLevelValidator,
  usesChatDaemon,
} from "../validators";
import { trackSessionChatWorkflow } from "../workflowWatchdog";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { finalizeCancelledAssistantMessage } from "../streaming";
import { finalizeOpenSyntheticTurnOnCancel } from "../_chat/chatResult";
import {
  drainChatQueueQuietly,
  drainSessionChatQueues,
} from "../_queues/helpers";
import { buildSessionPrompt, SESSION_TOOLS } from "./workflow";
import { resolveTurnProviderAccountId } from "../_userProviderAccounts/defaults";
import { resolveCredentialSourceLabel } from "../_userProviderAccounts/credentialSource";
import { selectUsageLimitRetryUserMessage } from "./resultTarget";
import type { Doc, Id } from "../_generated/dataModel";
import { notifyChatMentions } from "../_mentions/notifyChatMentions";
import { maybeInsertModelHandoffAlert } from "../_shared/modelHandoff";
import { composerTraitFields } from "../_shared/composerTraits";
import { detectCancelSupersession } from "../_chat/cancelRace";
import { isSandboxClosingStatus } from "../_sandbox/closingStatus";
import { touchUserActivity } from "../_sandbox/activity";
import {
  bindTurnWorkflow,
  closeOpenTurn,
  closeTurnForWorkflow,
  openSessionChatTurn,
} from "../_chat/turnStore";
import { emptyStallRetryPrompt } from "../_chat/stallRetry";
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

/** The idle-pause clock belongs to the sandbox, which every chat of a session shares. */
function sessionActivityRef(session: Doc<"sessions">) {
  return { kind: "session" as const, entityId: String(session._id) };
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
  // Normalise exactly as the page-open prewarm does (`launchTraitsFromStored`
  // in `prewarmDaemon` below): the composer can send a model default explicitly
  // (e.g. reasoning "high", its display value), and forwarding it verbatim gives
  // this turn's prewarm and the workflow's prewarm a different daemon opts sig
  // from the page-open one — killing the daemon that was just booted.
  const launchTraits = launchTraitsFromStored(normalizedModel, {
    reasoningLevel: settings.reasoningLevel,
    thinkingEnabled: settings.thinkingEnabled,
    use1mContext: settings.use1mContext,
    fastMode: settings.fastMode,
  });
  const usesDaemonPull = usesChatDaemon(normalizedModel);
  const turnId = await openSessionChatTurn(ctx, {
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
        interactionMode: "default" as const,
      }
    : undefined;
  const now = Date.now();
  await ctx.db.patch(chat._id, {
    pendingTurn,
    providerAccountId: stickyProviderAccountId,
    lastModel: normalizedModel,
    ...composerTraitFields(settings),
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
      ...launchTraits,
      allowedTools: SESSION_TOOLS,
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
      // Same normalisation as the prewarm above: the workflow forwards these
      // straight back into `prewarmSessionDaemon`.
      ...launchTraits,
      providerAccountId: stickyProviderAccountId,
      credentialOwnerUserId,
      userId: params.actingUserId,
      installationId: params.repo.installationId,
      turnId,
    },
  );

  await bindTurnWorkflow(ctx, turnId, String(workflowId));
  await trackSessionChatWorkflow(ctx, chat._id, workflowId);
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
    ...composerTraitFields(settings),
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

    const lastUserContent = await emptyStallRetryPrompt(ctx.db, {
      parentId: chat._id,
      sandboxStopped: args.sandboxStopped,
      hasActiveWorkflow: chat.activeWorkflowId !== undefined,
    });
    if (lastUserContent === null) return null;

    const repo = await ctx.db.get(session.repoId);
    if (!repo) return null;

    const actingUserId = session.createdBy ?? session.userId;
    await stageAndStartChatTurn(ctx, {
      context,
      repo,
      actingUserId,
      message: lastUserContent,
      // Raw sticky traits: `stageAndStartChatTurn` normalises them through
      // `launchTraitsFromStored` before they reach any daemon launch, so this
      // restaged turn's opts sig matches a warm daemon's instead of killing it.
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
 * Re-run the last user prompt on a different provider account after a
 * usage-limit failure. No new user bubble: the original message stays, its
 * credential label moves to the new account, and a fresh placeholder opens
 * below the failed reply — which dismisses the recovery banner because the
 * failed reply is no longer the newest message. Same model and reasoning as
 * the failed turn; other traits come from the chat's sticky fields.
 */
export const retryLastTurnWithAccount = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    /** null = the team credential. */
    providerAccountId: v.union(v.id("userProviderAccounts"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    const { chat, session } = context;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    if (
      chat.activeWorkflowId !== undefined ||
      chat.pendingTurn !== undefined
    ) {
      throw new Error("A turn is already running");
    }

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
      .order("desc")
      .take(20);
    const userMessage = selectUsageLimitRetryUserMessage(recent);

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    const providerAccountId = args.providerAccountId ?? undefined;
    const ownerUserId = session.createdBy ?? session.userId;
    await ctx.db.patch(userMessage._id, {
      credentialSourceLabel: await resolveCredentialSourceLabel(
        ctx.db,
        providerAccountId,
        ownerUserId,
      ),
    });

    await stageAndStartChatTurn(ctx, {
      context,
      repo,
      actingUserId: ctx.userId,
      message: userMessage.content,
      settings: {
        model: userMessage.model ?? normalizeAIModel(chat.lastModel),
        reasoningLevel: userMessage.reasoningLevel ?? chat.lastReasoningLevel,
        thinkingEnabled: chat.lastThinkingEnabled,
        use1mContext: chat.lastUse1mContext,
        fastMode: chat.lastFastMode,
        providerAccountId,
        attachmentStorageIds: userMessage.attachmentStorageIds,
      },
    });
    console.log(
      `[sessions] retryLastTurnWithAccount chatId=${args.chatId} providerAccountId=${String(args.providerAccountId)}`,
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
    sourceProposedPlanId: v.optional(v.id("proposedPlans")),
  },
  returns: v.union(v.literal("started"), v.literal("queued")),
  handler: async (ctx, args) => {
    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    const { chat, session } = context;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    if (chat.archived === true) throw new Error("This chat is closed");
    await touchUserActivity(ctx, sessionActivityRef(session), {
      source: "chat",
      userId: ctx.userId,
    });

    // Notify before the turn runs or queues so a mention fires either way.
    await notifyChatMentions(ctx, {
      content: args.message,
      authorUserId: ctx.userId,
      surface: { kind: "session", session },
    });

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    const { chatId, message, sourceProposedPlanId, ...settings } = args;
    void chatId;

    if (sourceProposedPlanId !== undefined) {
      const plan = await ctx.db.get(sourceProposedPlanId);
      if (plan && plan.sessionId === session._id) {
        const now = Date.now();
        await ctx.db.patch(sourceProposedPlanId, {
          implementedAt: now,
          implementationSessionId: session._id,
          updatedAt: now,
        });
      }
    }

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
    if (isSandboxClosingStatus(session.status)) return null;
    if (chat.archived === true) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    // Match the turn path's launch options so the first real message does not
    // immediately optsmismatch-kill this daemon (which races with
    // claimPendingTurn and leaves the chat stuck on Working). The sticky traits
    // must go through `launchTraitsFromStored` — the same normalisation the
    // composer applies — because the send path omits defaults.
    const credentialOwnerUserId = session.createdBy ?? session.userId;
    const normalizedModel = normalizeAIModel(chat.lastModel);
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmSessionDaemon, {
      sandboxId,
      chatId: chat._id,
      repoId: session.repoId,
      userId: session.userId,
      model: normalizedModel,
      ...launchTraitsFromStored(normalizedModel, {
        reasoningLevel: chat.lastReasoningLevel,
        thinkingEnabled: chat.lastThinkingEnabled,
        use1mContext: chat.lastUse1mContext,
        fastMode: chat.lastFastMode,
      }),
      allowedTools: SESSION_TOOLS,
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
      allowedTools: SESSION_TOOLS,
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
      sessionPersistenceId: v.union(v.id("sessions"), v.id("sessionChats")),
    }),
  ),
  handler: async (ctx, args) => {
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, args.userId))) {
      throw new Error("Not authorized");
    }
    if (
      !session.sandboxId ||
      isSandboxClosingStatus(session.status) ||
      chat.archived === true
    ) {
      return null;
    }
    const normalizedModel = normalizeAIModel(chat.lastModel);
    return {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      ownerUserId: session.userId,
      credentialOwnerUserId: session.createdBy ?? session.userId,
      model: normalizedModel,
      // Normalised here, not in the caller: the traits must be exactly what the
      // composer sends (defaults omitted) or the prewarm's opts sig differs from
      // the turn path's and kills the warm daemon.
      ...launchTraitsFromStored(normalizedModel, {
        reasoningLevel: chat.lastReasoningLevel,
        thinkingEnabled: chat.lastThinkingEnabled,
        use1mContext: chat.lastUse1mContext,
        fastMode: chat.lastFastMode,
      }),
      providerAccountId: chat.providerAccountId,
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
    /** Set by MCP send_chat_message / send_agent_message. */
    sentViaOrchestrator: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const content = args.message.trim();
    if (!content) return null;
    const displayContent = args.displayContent?.trim();

    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    const { chat, session } = context;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    await touchUserActivity(ctx, sessionActivityRef(session), {
      source: "chat",
      userId: ctx.userId,
    });

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
    // Sends at once when the chat is idle. Otherwise the queue waits: behind
    // the running turn, for a usage-limit reset, for a free parallel-chat
    // slot, or for Eva to wake — a sleeping sandbox is woken here and its
    // ready drain sends the message.
    await drainChatQueueQuietly(ctx, chat._id);
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
    await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      entityIdField: "chatId",
      entityId: String(chat._id),
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

  const { cancelOwnsCurrentTurn } = detectCancelSupersession({
    latestPendingTurn: latest.pendingTurn,
    cancelPendingRequestedAt: pendingRequestedAt,
    latestActiveWorkflowId: latest.activeWorkflowId,
    cancelWorkflowId: workflowIdToCancel,
  });

  if (cancelOwnsCurrentTurn) {
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
    await closeOpenTurn(ctx, chat._id, "cancelled", {
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
  if (cancelOwnsCurrentTurn) {
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
