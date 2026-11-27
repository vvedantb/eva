import { v, type Infer } from "convex/values";
import { mentionsEva } from "@eva/shared";
import { internal } from "../_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { workflow } from "../workflowManager";
import {
  authAction,
  authMutation,
  hasRepoAccess,
} from "../functions";
import {
  aiModelValidator,
  launchTraitsFromStored,
  normalizeAIModel,
  type previewAnnotationValidator,
  reasoningLevelValidator,
  usesChatDaemon,
} from "../validators";
import { trackSessionChatWorkflow } from "../workflowWatchdog";
import { clearStreamingActivity } from "../streaming";
import {
  drainChatQueueQuietly,
  drainSessionChatQueues,
} from "../_queues/helpers";
import { buildSessionPrompt, SESSION_TOOLS } from "./sessionPrompt";
import {
  buildDaemonPendingTurn,
  scheduleChatDaemonPrewarm,
} from "./daemonTurn";
import { resolveTurnProviderAccountId } from "../_userProviderAccounts/defaults";
import { resolveMessageCredential } from "../_userProviderAccounts/credentialSource";
import {
  resultTargetMessage,
  selectUsageLimitRetryUserMessage,
} from "./resultTarget";
import { routePersonChatMessage } from "../_projects/reports";
import { recordPersonChatPost } from "../chatReads";
import {
  ensureOwnerChat,
  reviveCoordinatorSession,
  type OwnerEntity,
} from "./ownedSession";
import { sessionAccountHolder } from "../_projects/projectAccount";
import type { Doc, Id } from "../_generated/dataModel";
import {
  notifyChatMentions,
  notifyThreadReply,
} from "../_mentions/notifyChatMentions";
import {
  bumpThreadRoot,
  threadReplyPrompt,
} from "../_messages/replies";
import { joinThreadOnReply } from "../_messages/threadParticipants";
import { composerTraitFields } from "../_shared/composerTraits";
import { cancelChatTurn } from "../_chat/cancelRace";
import { isSandboxClosingStatus } from "../_sandbox/closingStatus";
import { touchUserActivity } from "../_sandbox/activity";
import { bindTurnWorkflow, openSessionChatTurn } from "../_chat/turnStore";
import {
  hasOpenChatTurn,
  openTurnWorkflowId,
} from "../_chat/turnProjection";
import { emptyStallRetryPrompt } from "../_chat/stallRetry";
import {
  getSessionChatOrThrow,
  getSessionChatWithAccess,
  findMainChat,
  loadSessionChat,
  sessionChatPersistenceId,
  sessionChatPersistenceIdValidator,
  sessionChatStreamingEntityId,
  type SessionChatContext,
} from "../_sessionChats/helpers";
import { userAuth } from "../_auth/currentUser";

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

/** What became of a sent message: it started a turn, queued, or was stored as a comment. */
const sendOutcomeValidator = v.union(
  v.literal("started"),
  v.literal("queued"),
  v.literal("posted"),
);

/** The idle-pause clock belongs to the sandbox, which the session's chat uses. */
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
    /** A retry of a thread turn: Eva answers in that thread again. */
    replyTo?: Id<"messages">;
    /** A retried task run stays one (`_agentTasks/taskRunTurn.ts`). */
    taskRun?: Doc<"turns">["taskRun"];
  },
): Promise<void> {
  const { chat, session } = params.context;
  const { settings } = params;
  const [stickyProviderAccountId, user] = await Promise.all([
    resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: settings.providerAccountId,
      ownerUserId: await sessionAccountHolder(
        ctx.db,
        session,
        settings.providerAccountId,
      ),
      model: settings.model,
      changePolicy: "owner-pool",
    }),
    ctx.db.get(params.actingUserId),
  ]);
  const credentialOwnerUserId = await sessionAccountHolder(
    ctx.db,
    session,
    stickyProviderAccountId,
  );
  const streamingEntityId = sessionChatStreamingEntityId(chat._id);

  await clearStreamingActivity(ctx, streamingEntityId);

  const placeholderMessageId = await ctx.db.insert("messages", {
    parentId: chat._id,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    activityLog: "",
    replyTo: params.replyTo,
  });
  if (params.replyTo !== undefined) {
    await bumpThreadRoot(ctx, params.replyTo, undefined);
  }

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
    replyTo: params.replyTo,
    askedBy: params.actingUserId,
    prompt,
    attachmentStorageIds: settings.attachmentStorageIds,
    model: normalizedModel,
    sandboxId: session.sandboxId,
    repoId: session.repoId,
    taskRun: params.taskRun,
  });
  const pendingTurn = usesDaemonPull
    ? buildDaemonPendingTurn({
        prompt,
        turnId,
        attachmentStorageIds: settings.attachmentStorageIds,
        model: normalizedModel,
      })
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

  if (usesDaemonPull) {
    await scheduleChatDaemonPrewarm(ctx, {
      session,
      chat,
      userId: params.actingUserId,
      model: normalizedModel,
      launchTraits,
      providerAccountId: stickyProviderAccountId,
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

/**
 * The message a retried turn sends. A thread turn's retry wraps the reply in
 * the thread prompt again and answers in the same thread.
 */
async function threadTurnMessage(
  ctx: MutationCtx,
  replyTo: Id<"messages"> | undefined,
  content: string,
): Promise<{ message: string; replyTo?: Id<"messages"> }> {
  const root = replyTo === undefined ? null : await ctx.db.get(replyTo);
  if (!root) return { message: content };
  return { message: threadReplyPrompt(root, content), replyTo: root._id };
}

/** Parks a message on the chat's queue; the next drain starts it. */
async function enqueueChatMessage(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    userId: Id<"users">;
    content: string;
    displayContent?: string;
    /** Preview "Select element" sends; copied to the user row on start. */
    annotation?: Infer<typeof previewAnnotationValidator>;
    settings: TurnSettings;
    sentViaOrchestrator?: boolean;
    /** A thread reply for Eva: her answer joins this root's thread. */
    replyTo?: Id<"messages">;
    /** This message runs the chat's task (`_agentTasks/taskRunTurn.ts`). */
    taskRun?: Doc<"queuedMessages">["taskRun"];
  },
): Promise<Id<"queuedMessages">> {
  const { chat, session } = params.context;
  const { settings } = params;
  const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
    requestedAccountId: settings.providerAccountId,
    ownerUserId: await sessionAccountHolder(
      ctx.db,
      session,
      settings.providerAccountId,
    ),
    model: settings.model,
    changePolicy: "owner-pool",
  });
  const now = Date.now();
  const queuedId = await ctx.db.insert("queuedMessages", {
    parentId: chat._id,
    content: params.content,
    displayContent: params.displayContent,
    annotation: params.annotation,
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
    replyTo: params.replyTo,
    taskRun: params.taskRun,
  });
  await ctx.db.patch(chat._id, {
    lastModel: settings.model,
    providerAccountId,
    ...composerTraitFields(settings),
    updatedAt: now,
  });
  await ctx.db.patch(session._id, { updatedAt: now });
  return queuedId;
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
      hasActiveWorkflow: await hasOpenChatTurn(ctx.db, chat._id),
    });
    if (lastUserContent === null) return null;

    const repo = await ctx.db.get(session.repoId);
    if (!repo) return null;

    const actingUserId = session.createdBy ?? session.userId;
    await stageAndStartChatTurn(ctx, {
      context,
      repo,
      actingUserId,
      taskRun: turn.taskRun,
      ...(await threadTurnMessage(ctx, turn.replyTo, lastUserContent)),
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
    const context = await getSessionChatWithAccess(
      ctx.db,
      args.chatId,
      ctx.userId,
    );
    const { chat, session } = context;
    if (
      (await hasOpenChatTurn(ctx.db, chat._id)) ||
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
    // A failed thread turn retries in its thread.
    const failedReplyTo = resultTargetMessage(recent)?.replyTo;

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    const providerAccountId = args.providerAccountId ?? undefined;
    const ownerUserId = await sessionAccountHolder(
      ctx.db,
      session,
      providerAccountId,
    );
    await ctx.db.patch(userMessage._id, {
      ...(await resolveMessageCredential(
        ctx.db,
        providerAccountId,
        ownerUserId,
      )),
    });

    await stageAndStartChatTurn(ctx, {
      context,
      repo,
      actingUserId: ctx.userId,
      taskRun: userMessage.taskRun,
      ...(await threadTurnMessage(ctx, failedReplyTo, userMessage.content)),
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
 * Fired when a session's chat opens: boot its daemon ahead of the user's first
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
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    // Match the turn path's launch options so the first real message does not
    // immediately optsmismatch-kill this daemon (which races with
    // claimPendingTurn and leaves the chat stuck on Working). The sticky traits
    // must go through `launchTraitsFromStored` — the same normalisation the
    // composer applies — because the send path omits defaults.
    const credentialOwnerUserId = await sessionAccountHolder(
      ctx.db,
      session,
      chat.providerAccountId,
    );
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
      sessionPersistenceId: sessionChatPersistenceIdValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, args.userId))) {
      throw new Error("Not authorized");
    }
    if (!session.sandboxId || isSandboxClosingStatus(session.status)) {
      return null;
    }
    const normalizedModel = normalizeAIModel(chat.lastModel);
    return {
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      ownerUserId: session.userId,
      credentialOwnerUserId: await sessionAccountHolder(
        ctx.db,
        session,
        chat.providerAccountId,
      ),
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

/**
 * MCP's send (`send_chat_message`, `send_agent_message`) to the chat it
 * resolved: the same path as `chats.send`, so the server alone decides
 * whether it runs now or queues. Internal because MCP names its caller by
 * Clerk id; the access check is the one `chats.send` makes.
 */
export const sendFromMcp = internalMutation({
  args: {
    clerkUserId: v.string(),
    chatId: v.string(),
    message: v.string(),
    model: aiModelValidator,
    /** Absent is Team. */
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    /** Stamps the "via MCP" chat badge. */
    sentViaOrchestrator: v.boolean(),
  },
  returns: sendOutcomeValidator,
  handler: async (ctx, args) => {
    const content = args.message.trim();
    if (!content) throw new Error("The message is empty");
    const user = await userAuth.getUserByClerkId(ctx, args.clerkUserId);
    if (!user) throw new Error("User not found");
    const chatId = ctx.db.normalizeId("sessionChats", args.chatId);
    if (!chatId) throw new Error("Chat not found");
    const context = await getSessionChatWithAccess(ctx.db, chatId, user._id);
    return await sendSessionChatMessage(ctx, {
      context,
      userId: user._id,
      content,
      settings: {
        model: args.model,
        providerAccountId: args.providerAccountId,
      },
      sentViaOrchestrator: args.sentViaOrchestrator,
    });
  },
});

/**
 * Replies in a thread on a chat message (projects v2, PR D). The reply is a
 * row of the same chat with `replyTo` set, so it shows in the thread panel
 * only. It notifies the thread's people and anyone @-mentioned, and wakes Eva
 * only when it @mentions her: her answer then lands in this thread.
 */
export const addReply = authMutation({
  args: {
    // A plain string: the chat renders optimistic rows under client-minted ids.
    rootId: v.string(),
    content: v.string(),
    ...turnSettingsArgs,
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const content = args.content.trim();
    if (!content) throw new Error("A reply needs text");
    const targetId = ctx.db.normalizeId("messages", args.rootId);
    const target = targetId ? await ctx.db.get(targetId) : null;
    if (!target) throw new Error("This message cannot take replies yet");
    // A reply to a reply joins the same thread.
    const root =
      target.replyTo === undefined ? target : await ctx.db.get(target.replyTo);
    if (!root) throw new Error("Message not found");
    const chatId = ctx.db.normalizeId("sessionChats", root.parentId);
    if (!chatId) throw new Error("Replies work in session chats only");
    const context = await getSessionChatWithAccess(ctx.db, chatId, ctx.userId);
    const { chat, session } = context;

    const replyId = await ctx.db.insert("messages", {
      parentId: root.parentId,
      role: "user",
      content,
      timestamp: Date.now(),
      userId: ctx.userId,
      replyTo: root._id,
    });
    await bumpThreadRoot(ctx, root._id, ctx.userId);
    await touchUserActivity(ctx, sessionActivityRef(session), {
      source: "chat",
      userId: ctx.userId,
    });

    const surface = { kind: "session" as const, session, chat };
    // The mentioned hear of it as a mention; the thread's followers as a
    // reply. Posting reads this thread for the author.
    const mentionedIds = await notifyChatMentions(ctx, {
      content,
      authorUserId: ctx.userId,
      surface,
      threadRoot: root,
    });
    const reply = await ctx.db.get(replyId);
    if (!reply) throw new Error("Reply not stored");
    await joinThreadOnReply(ctx, {
      root,
      reply,
      replierId: ctx.userId,
      mentionedIds,
      repoId: session.repoId,
    });
    await notifyThreadReply(ctx, {
      content,
      authorUserId: ctx.userId,
      rootId: root._id,
      mentionedIds,
      surface,
    });

    // A reply wakes Eva only when it @mentions her: replies are between
    // people by default (projects v2, decision 2).
    if (mentionsEva(content)) {
      const { rootId, content: omitted, ...settings } = args;
      void rootId;
      void omitted;
      await enqueueChatMessage(ctx, {
        context,
        userId: ctx.userId,
        content: threadReplyPrompt(root, content),
        // The queue panel shows the reply, not the whole thread prompt.
        displayContent: content,
        settings,
        replyTo: root._id,
      });
      await drainChatQueueQuietly(ctx, chat._id);
    }
    return replyId;
  },
});

/**
 * Queues a user message on a session chat and sends it at once when the chat
 * is idle. The caller checks repo access. Shared by `chats.send` (both apps)
 * and MCP's `sendFromMcp`. Returns whether the message started a turn,
 * queued, or was stored as a comment.
 */
export async function sendSessionChatMessage(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    userId: Id<"users">;
    content: string;
    displayContent?: string;
    annotation?: Infer<typeof previewAnnotationValidator>;
    settings: TurnSettings;
    sentViaOrchestrator?: boolean;
  },
): Promise<Infer<typeof sendOutcomeValidator>> {
  const { chat } = params.context;
  // A person's message reopens a coordinator chat an old phase-based close archived.
  const session = await reviveCoordinatorSession(ctx, params.context.session);
  await touchUserActivity(ctx, sessionActivityRef(session), {
    source: "chat",
    userId: params.userId,
  });
  const mentionedIds = await notifyChatMentions(ctx, {
    content: params.displayContent ?? params.content,
    authorUserId: params.userId,
    surface: { kind: "session", session, chat },
  });
  await recordPersonChatPost(ctx, {
    parentId: chat._id,
    authorId: params.userId,
    mentionedIds,
  });
  // A project task waiting on its question takes this as the answer; a
  // coordinator-chat message for teammates only is stored as a quiet comment.
  const routed = await routePersonChatMessage(ctx, {
    context: params.context,
    userId: params.userId,
    message: params.content,
    userRow: {
      content: params.displayContent ?? params.content,
      attachmentStorageIds: params.settings.attachmentStorageIds,
      annotation: params.annotation,
    },
  });
  if (routed === "answered") return "started";
  if (routed === "posted") return "posted";
  const queuedId = await enqueueChatMessage(ctx, params);
  // Sends at once when the chat is idle. Otherwise the queue waits: behind
  // the running turn, for a usage-limit reset, for a free parallel-chat
  // slot, or for Eva to wake — a sleeping sandbox is woken here and its
  // ready drain sends the message.
  await drainChatQueueQuietly(ctx, chat._id);
  // The drain deletes the row it starts; one still there waits in the queue.
  return (await ctx.db.get(queuedId)) === null ? "started" : "queued";
}

/** A turn on the chat's sticky model, traits and account. */
export function stickyTurnSettings(
  chat: Doc<"sessionChats">,
  model: Doc<"turns">["model"],
  attachmentStorageIds?: Id<"_storage">[],
): TurnSettings {
  return {
    model,
    ...launchTraitsFromStored(model, {
      reasoningLevel: chat.lastReasoningLevel,
      thinkingEnabled: chat.lastThinkingEnabled,
      use1mContext: chat.lastUse1mContext,
      fastMode: chat.lastFastMode,
    }),
    providerAccountId: chat.providerAccountId,
    attachmentStorageIds,
  };
}

/**
 * Queues a task's run as a chat message on the chat's sticky picks and
 * drains the queue: it runs at once on an idle chat, after the running turn
 * otherwise, and a sleeping sandbox wakes for it. `content` is what the agent
 * gets; `displayContent` is what the chat shows. The caller checks access.
 */
export async function queueTaskRunMessage(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    userId: Id<"users">;
    content: string;
    displayContent: string;
    taskRun: NonNullable<Doc<"queuedMessages">["taskRun"]>;
    attachmentStorageIds?: Id<"_storage">[];
    /** The project coordinator sent it (an answer to the task's question). */
    sentViaOrchestrator?: boolean;
  },
): Promise<void> {
  const { chat } = params.context;
  await enqueueChatMessage(ctx, {
    context: params.context,
    userId: params.userId,
    content: params.content,
    displayContent: params.displayContent,
    taskRun: params.taskRun,
    sentViaOrchestrator: params.sentViaOrchestrator,
    settings: stickyTurnSettings(
      chat,
      normalizeAIModel(chat.lastModel),
      params.attachmentStorageIds,
    ),
  });
  await drainChatQueueQuietly(ctx, chat._id);
}

/**
 * A person's message to a task's or project's chat (a new project's first
 * message): its first send creates the owner's session chat
 * (`ensureOwnerChat`), then it runs on that chat's sticky picks. The caller
 * checks access.
 */
export async function sendOwnerChatMessage(
  ctx: MutationCtx,
  params: {
    entity: OwnerEntity;
    userId: Id<"users">;
    content: string;
  },
): Promise<void> {
  const context = await ensureOwnerChat(ctx, params.entity);
  await sendSessionChatMessage(ctx, {
    context,
    userId: params.userId,
    content: params.content,
    settings: stickyTurnSettings(
      context.chat,
      normalizeAIModel(context.chat.lastModel),
    ),
  });
}

/**
 * Queues a message Eva sends by itself (a project coordinator's wake-up, a
 * routed reply) on a session chat and drains the queue: it runs at once on an
 * idle chat, after the running turn otherwise, and a sleeping sandbox wakes
 * for it. No user activity and no mentions: no person typed it into this
 * chat. The caller checks the target.
 */
export async function queueSystemChatMessage(
  ctx: MutationCtx,
  params: {
    context: SessionChatContext;
    userId: Id<"users">;
    content: string;
    displayContent?: string;
    settings: TurnSettings;
    /** Shows the "via MCP" badge. Defaults to true. */
    sentViaOrchestrator?: boolean;
  },
): Promise<void> {
  await enqueueChatMessage(ctx, {
    ...params,
    sentViaOrchestrator: params.sentViaOrchestrator ?? true,
  });
  await drainChatQueueQuietly(ctx, params.context.chat._id);
}

/**
 * Cancels one chat's active turn, then drains the queue. For a daemon-backed
 * turn, sets `cancelRequestedAt` so the warm provider process interrupts its
 * own in-flight turn on its next `claimPendingTurn` poll. One-shot providers
 * retain the process-kill path.
 *
 * `holdQueue`: a Stop holds what is already queued (`queueHeldAt`), so Stop
 * never starts the next message by itself. A steer that interrupts passes
 * false: its message must start the next turn.
 */
export async function cancelChatExecution(
  ctx: MutationCtx,
  context: SessionChatContext,
  { holdQueue }: { holdQueue: boolean },
): Promise<void> {
  const { chat, session } = context;
  const cancelled = await cancelChatTurn(ctx, {
    id: chat._id,
    entity: chat,
    activeWorkflowId: () => openTurnWorkflowId(ctx, chat._id),
    streamingEntityId: sessionChatStreamingEntityId(chat._id),
    interrupt: async () => {
      if (usesChatDaemon(normalizeAIModel(chat.lastModel))) {
        await ctx.db.patch(chat._id, { cancelRequestedAt: Date.now() });
      } else if (session.sandboxId) {
        // One-shot providers run under the sandbox-wide /tmp/run-design.pid,
        // not a per-chat daemon pidfile, so only the process kill stops them.
        await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
          sandboxId: session.sandboxId,
          repoId: session.repoId,
        });
      }
    },
    getLatest: () => ctx.db.get(chat._id),
  });
  if (!cancelled) return;

  const now = Date.now();
  const chatPatch: {
    pendingTurn?: undefined;
    syntheticTurnMessageId?: undefined;
    queueHeldAt?: number;
    updatedAt: number;
  } = { updatedAt: now };
  if (holdQueue) chatPatch.queueHeldAt = now;
  if (cancelled.clearsPendingTurn) chatPatch.pendingTurn = undefined;
  if (cancelled.cancelOwnsCurrentTurn) {
    chatPatch.syntheticTurnMessageId = undefined;
  }
  await ctx.db.patch(chat._id, chatPatch);
  await drainSessionChatQueues(ctx, session._id, chat._id);
}

/** Stops a session's chat (the fleet `stop_agent` tool). */
export const cancelSessionExecution = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    const chat = await findMainChat(ctx.db, session._id);
    if (chat) {
      await cancelChatExecution(ctx, { chat, session }, { holdQueue: true });
    }
    return null;
  },
});
