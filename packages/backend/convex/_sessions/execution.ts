import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { workflow, cancelTrackedWorkflow } from "../workflowManager";
import { authAction, authMutation, hasRepoAccess } from "../functions";
import {
  aiModelValidator,
  launchTraitsFromStored,
  normalizeAIModel,
  reasoningLevelValidator,
  usesChatDaemon,
} from "../validators";
import { trackSessionWorkflow } from "../workflowWatchdog";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { finalizeCancelledAssistantMessage } from "../streaming";
import { finalizeOpenSyntheticTurnOnCancel } from "../_chat/chatResult";
import { syncSessionDaemonState } from "./daemonState";
import { startNextQueuedSessionMessage } from "../_queues/helpers";
import { buildSessionPrompt, sessionTurnTools } from "./workflow";
import { resolveTurnProviderAccountId } from "../_userProviderAccounts/defaults";
import { resolveCredentialSourceLabel } from "../_userProviderAccounts/credentialSource";
import { resultTargetMessage } from "./resultTarget";
import type { Doc, Id } from "../_generated/dataModel";
import { notifyChatMentions } from "../_mentions/notifyChatMentions";
import { maybeInsertModelHandoffAlert } from "../_shared/modelHandoff";
import {
  bindTurnWorkflow,
  closeOpenSessionTurn,
  closeTurnForWorkflow,
  openSessionTurn,
} from "../_chat/turnStore";
import {
  countStallAlertsAfterLastUser,
  shouldRetryEmptyStall,
} from "../_chat/stallRetry";

async function stageAndStartSessionTurn(
  ctx: MutationCtx,
  params: {
    session: Doc<"sessions">;
    repo: Doc<"githubRepos">;
    actingUserId: Id<"users">;
    message: string;
    model: Doc<"turns">["model"];
    reasoningLevel?: Doc<"sessions">["lastReasoningLevel"];
    thinkingEnabled?: boolean;
    use1mContext?: boolean;
    fastMode?: boolean;
    providerAccountId?: Id<"userProviderAccounts">;
    attachmentStorageIds?: Id<"_storage">[];
    sourceProposedPlanId?: Id<"proposedPlans">;
  },
): Promise<void> {
  const stickyProviderAccountId = await resolveTurnProviderAccountId(ctx.db, {
    requestedAccountId: params.providerAccountId,
    ownerUserId: params.session.createdBy ?? params.session.userId,
    model: params.model,
    changePolicy: "owner-pool",
  });
  const credentialOwnerUserId =
    params.session.createdBy ?? params.session.userId;

  await clearStreamingActivity(ctx, String(params.session._id));

  const placeholderMessageId = await ctx.db.insert("messages", {
    parentId: params.session._id,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    activityLog: "",
  });

  const user = await ctx.db.get(params.actingUserId);
  const { prompt } = await buildSessionPrompt(ctx, {
    session: params.session,
    repo: params.repo,
    user,
    message: params.message,
    model: params.model,
  });

  const normalizedModel = normalizeAIModel(params.model);
  // Normalise exactly as the page-open prewarm does (`launchTraitsFromStored`
  // in `prewarmDaemon` below): the composer can send a model default explicitly
  // (e.g. reasoning "high", its display value), and forwarding it verbatim gives
  // this turn's prewarm and the workflow's prewarm a different daemon opts sig
  // from the page-open one — killing the daemon that was just booted.
  const launchTraits = launchTraitsFromStored(normalizedModel, {
    reasoningLevel: params.reasoningLevel,
    thinkingEnabled: params.thinkingEnabled,
    use1mContext: params.use1mContext,
    fastMode: params.fastMode,
  });
  const usesDaemonPull = usesChatDaemon(normalizedModel);
  const turnId = await openSessionTurn(ctx, {
    sessionId: params.session._id,
    streamingEntityId: String(params.session._id),
    placeholderMessageId,
    prompt,
    attachmentStorageIds: params.attachmentStorageIds,
    model: normalizedModel,
    sandboxId: params.session.sandboxId,
    repoId: params.session.repoId,
  });
  const pendingTurn = usesDaemonPull
    ? {
        prompt,
        requestedAt: Date.now(),
        turnId,
        attachmentStorageIds: params.attachmentStorageIds,
        model: normalizedModel,
        interactionMode: "default" as const,
      }
    : undefined;
  await ctx.db.patch(params.session._id, {
    pendingTurn,
    providerAccountId: stickyProviderAccountId,
    lastModel: normalizedModel,
    ...(params.reasoningLevel !== undefined
      ? { lastReasoningLevel: params.reasoningLevel }
      : {}),
    ...(params.thinkingEnabled !== undefined
      ? { lastThinkingEnabled: params.thinkingEnabled }
      : {}),
    ...(params.use1mContext !== undefined
      ? { lastUse1mContext: params.use1mContext }
      : {}),
    ...(params.fastMode !== undefined ? { lastFastMode: params.fastMode } : {}),
    updatedAt: Date.now(),
  });
  await syncSessionDaemonState(ctx, params.session, { pendingTurn });

  if (usesDaemonPull && params.session.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmSessionDaemon, {
      sandboxId: params.session.sandboxId,
      sessionId: params.session._id,
      repoId: params.session.repoId,
      userId: params.actingUserId,
      model: normalizedModel,
      ...launchTraits,
      ...sessionTurnTools(params.session.isOrchestrator),
      providerAccountId: stickyProviderAccountId,
      credentialOwnerUserId,
      sessionPersistenceId: params.session._id,
    });
  }

  const workflowId = await workflow.start(
    ctx,
    internal.sessionWorkflow.sessionExecuteWorkflow,
    {
      sessionId: params.session._id,
      message: params.message,
      model: params.model,
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
  await trackSessionWorkflow(ctx, params.session._id, workflowId);
}

/**
 * Restage the last user prompt after an empty stall so the question is not
 * lost. No new user bubble — the original message stays, a new placeholder
 * opens below the stall alert. One shot: a second stall of the same prompt
 * stays failed.
 */
export const retryEmptyStalledSessionTurn = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    turnId: v.id("turns"),
    sandboxStopped: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    const turn = await ctx.db.get(args.turnId);
    if (!session || !turn) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .order("desc")
      .take(20);
    const counted = countStallAlertsAfterLastUser(messages);
    if (
      !shouldRetryEmptyStall({
        sandboxStopped: args.sandboxStopped,
        hasActiveWorkflow: session.activeWorkflowId !== undefined,
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
    await stageAndStartSessionTurn(ctx, {
      session,
      repo,
      actingUserId,
      message: lastUserContent,
      model: turn.model,
      // Raw sticky traits: `stageAndStartSessionTurn` normalises them through
      // `launchTraitsFromStored` before they reach any daemon launch, so this
      // restaged turn's opts sig matches a warm daemon's instead of killing it.
      reasoningLevel: session.lastReasoningLevel,
      thinkingEnabled: session.lastThinkingEnabled,
      use1mContext: session.lastUse1mContext,
      fastMode: session.lastFastMode,
      providerAccountId: session.providerAccountId,
      attachmentStorageIds: turn.attachmentStorageIds,
    });
    console.log(
      `[sessions] retryEmptyStalledSessionTurn sessionId=${args.sessionId} turnId=${args.turnId}`,
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
 * the failed turn; other traits come from the session's sticky fields.
 */
export const retryLastTurnWithAccount = authMutation({
  args: {
    sessionId: v.id("sessions"),
    /** null = the team credential. */
    providerAccountId: v.union(v.id("userProviderAccounts"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    if (
      session.activeWorkflowId !== undefined ||
      session.pendingTurn !== undefined
    ) {
      throw new Error("A turn is already running");
    }

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .order("desc")
      .take(20);
    const reply = resultTargetMessage(recent);
    if (
      reply === undefined ||
      reply.errorType !== "rate_limit" ||
      reply.finishedAt === undefined
    ) {
      throw new Error("The last turn did not fail on a usage limit");
    }

    const userMessage = recent.find((message) => message.role === "user");
    if (!userMessage) throw new Error("No message to retry");

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

    await stageAndStartSessionTurn(ctx, {
      session,
      repo,
      actingUserId: ctx.userId,
      message: userMessage.content,
      model: userMessage.model ?? normalizeAIModel(session.lastModel),
      reasoningLevel: userMessage.reasoningLevel ?? session.lastReasoningLevel,
      thinkingEnabled: session.lastThinkingEnabled,
      use1mContext: session.lastUse1mContext,
      fastMode: session.lastFastMode,
      providerAccountId,
      attachmentStorageIds: userMessage.attachmentStorageIds,
    });
    console.log(
      `[sessions] retryLastTurnWithAccount sessionId=${args.sessionId} providerAccountId=${String(args.providerAccountId)}`,
    );
    return null;
  },
});

/** Frontend trigger to start a session execution workflow. */
export const startExecute = authMutation({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
    model: aiModelValidator,
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    sourceProposedPlanId: v.optional(v.id("proposedPlans")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    // Notify before the turn runs or queues so a mention fires either way.
    await notifyChatMentions(ctx, {
      content: args.message,
      authorUserId: ctx.userId,
      surface: { kind: "session", session },
    });

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    // Daemon-pull dispatch: stage the turn for a warm daemon to claim in one
    // poll instead of waiting on the workflow's durable step queue. The user
    // row is already stored (the client sends addMessage first), so handoff
    // detection sees it and posts its alert above the new placeholder.
    await maybeInsertModelHandoffAlert(
      ctx,
      args.sessionId,
      args.model,
      session.provider,
    );

    if (args.sourceProposedPlanId !== undefined) {
      const plan = await ctx.db.get(args.sourceProposedPlanId);
      if (plan && plan.sessionId === args.sessionId) {
        const now = Date.now();
        await ctx.db.patch(args.sourceProposedPlanId, {
          implementedAt: now,
          implementationSessionId: args.sessionId,
          updatedAt: now,
        });
      }
    }

    await stageAndStartSessionTurn(ctx, {
      session,
      repo,
      actingUserId: ctx.userId,
      message: args.message,
      model: args.model,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
      providerAccountId: args.providerAccountId,
      attachmentStorageIds: args.attachmentStorageIds,
      sourceProposedPlanId: args.sourceProposedPlanId,
    });

    return null;
  },
});

/**
 * Fired when a session page opens: boot its chat daemon ahead of the user's
 * first message so that message is warm instead of paying a ~20s cold respawn.
 * No-op unless the session already has a sandbox and uses a daemon provider.
 * Best-effort and cheap to call repeatedly (the action skips if already warm).
 */
export const prewarmDaemon = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || !session.sandboxId) return null;
    // Never prewarm a stopped/stopping session. prewarmSessionDaemon execs on
    // the sandbox, and on Vercel any exec lazily resumes a stopped VM (SDK
    // withResume) — resurrecting a sandbox the user stopped, invisibly (the
    // session status stays "closed"). A closed session keeps its sandboxId, so
    // without this guard merely opening its page (SessionDetailClient fires this
    // on mount) wakes the VM behind the user's back.
    if (session.status === "closed" || session.status === "stopping")
      return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    // Match the turn path's launch options so the first real message does not
    // immediately optsmismatch-kill this daemon (which races with
    // claimPendingTurn and leaves the chat stuck on Working). The sticky traits
    // must go through `launchTraitsFromStored` — the same normalisation the
    // composer applies — because the send path omits defaults. Forwarding the
    // stored values verbatim (e.g. reasoning "high", which is the Claude
    // default, or `fastMode: false` on a model with no Fast trait) yields a
    // different opts sig from the turn path and kill+respawns the warm daemon on
    // every page open (each respawn window can duplicate daemons).
    const credentialOwnerUserId = session.createdBy ?? session.userId;
    const normalizedModel = normalizeAIModel(session.lastModel);
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmSessionDaemon, {
      sandboxId: session.sandboxId,
      sessionId: args.sessionId,
      repoId: session.repoId,
      userId: session.userId,
      model: normalizedModel,
      ...launchTraitsFromStored(normalizedModel, {
        reasoningLevel: session.lastReasoningLevel,
        thinkingEnabled: session.lastThinkingEnabled,
        use1mContext: session.lastUse1mContext,
        fastMode: session.lastFastMode,
      }),
      ...sessionTurnTools(session.isOrchestrator),
      providerAccountId: session.providerAccountId,
      credentialOwnerUserId,
      sessionPersistenceId: args.sessionId,
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
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.sessionWorkflow.getDaemonPrewarmData,
      { sessionId: args.sessionId, userId: ctx.userId },
    );
    if (!data) return null;
    await ctx.runAction(internal.sandbox.prewarmSessionDaemon, {
      sandboxId: data.sandboxId,
      sessionId: args.sessionId,
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
      sessionPersistenceId: args.sessionId,
    });
    return null;
  },
});

export const getDaemonPrewarmData = internalQuery({
  args: {
    sessionId: v.id("sessions"),
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
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, args.userId))) {
      throw new Error("Not authorized");
    }
    if (
      !session.sandboxId ||
      session.status === "closed" ||
      session.status === "stopping"
    ) {
      return null;
    }
    const normalizedModel = normalizeAIModel(session.lastModel);
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
        reasoningLevel: session.lastReasoningLevel,
        thinkingEnabled: session.lastThinkingEnabled,
        use1mContext: session.lastUse1mContext,
        fastMode: session.lastFastMode,
      }),
      providerAccountId: session.providerAccountId,
      isOrchestrator: session.isOrchestrator,
    };
  },
});

/** Queues a message to be processed after the current active workflow finishes. */
export const enqueueMessage = authMutation({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
    /** Compact chat-display text when `message` is a rich agent prompt. */
    displayContent: v.optional(v.string()),
    model: aiModelValidator,
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    /** Set by the orchestrator's `send_agent_message` MCP tool. */
    sentViaOrchestrator: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const content = args.message.trim();
    if (!content) return null;
    const displayContent = args.displayContent?.trim();

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: args.providerAccountId,
      ownerUserId: session.createdBy ?? session.userId,
      model: args.model,
      changePolicy: "owner-pool",
    });

    await notifyChatMentions(ctx, {
      content: displayContent || content,
      authorUserId: ctx.userId,
      surface: { kind: "session", session },
    });

    await ctx.db.insert("queuedMessages", {
      parentId: args.sessionId,
      content,
      displayContent: displayContent || undefined,
      createdAt: Date.now(),
      order: Date.now(),
      userId: ctx.userId,
      model: args.model,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
      providerAccountId,
      attachmentStorageIds: args.attachmentStorageIds,
      sentViaOrchestrator: args.sentViaOrchestrator,
    });
    await ctx.db.patch(args.sessionId, {
      lastModel: args.model,
      providerAccountId,
      ...(args.reasoningLevel !== undefined
        ? { lastReasoningLevel: args.reasoningLevel }
        : {}),
      ...(args.thinkingEnabled !== undefined
        ? { lastThinkingEnabled: args.thinkingEnabled }
        : {}),
      ...(args.use1mContext !== undefined
        ? { lastUse1mContext: args.use1mContext }
        : {}),
      ...(args.fastMode !== undefined ? { lastFastMode: args.fastMode } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Cancels the active session workflow and starts queued messages. For a
 * daemon-backed turn, sets `cancelRequestedAt` so the warm provider process
 * interrupts its own in-flight turn on its next `claimPendingTurn` poll.
 * One-shot providers retain the process-kill path.
 */
export const cancelExecution = authMutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    // Snapshot what this cancel owns. A concurrent startExecute may stage a
    // newer pendingTurn / activeWorkflowId while we run — must not clear those
    // or mark the newer assistant placeholder as cancelled.
    const workflowIdToCancel = session.activeWorkflowId;
    const pendingRequestedAt = session.pendingTurn?.requestedAt;

    await cancelTrackedWorkflow(ctx, workflowIdToCancel);

    if (usesChatDaemon(normalizeAIModel(session.lastModel))) {
      const cancelRequestedAt = Date.now();
      await ctx.db.patch(args.sessionId, { cancelRequestedAt });
      await syncSessionDaemonState(ctx, session, { cancelRequestedAt });
    } else if (session.sandboxId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
        sandboxId: session.sandboxId,
        repoId: session.repoId,
      });
    }

    if (workflowIdToCancel !== undefined) {
      await closeTurnForWorkflow(
        ctx,
        args.sessionId,
        workflowIdToCancel,
        "cancelled",
        { error: "Cancelled by the user" },
      );
    }

    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", String(args.sessionId)))
      .first();

    const latest = await ctx.db.get(args.sessionId);
    if (!latest) return null;

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
        .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
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
      await closeOpenSessionTurn(ctx, args.sessionId, "cancelled", {
        error: "Cancelled by the user",
      });
    }

    await clearStreamingActivity(ctx, String(args.sessionId));

    const sessionPatch: {
      activeWorkflowId?: undefined;
      pendingTurn?: undefined;
      syntheticTurnMessageId?: undefined;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (
      workflowIdToCancel !== undefined &&
      latest.activeWorkflowId === workflowIdToCancel
    ) {
      sessionPatch.activeWorkflowId = undefined;
    }
    const clearsPendingTurn =
      pendingRequestedAt !== undefined &&
      latest.pendingTurn?.requestedAt === pendingRequestedAt;
    if (clearsPendingTurn) {
      sessionPatch.pendingTurn = undefined;
    }
    if (!newerTurnStaged && !newerWorkflowTracked) {
      sessionPatch.syntheticTurnMessageId = undefined;
    }

    await ctx.db.patch(args.sessionId, sessionPatch);
    if (clearsPendingTurn) {
      await syncSessionDaemonState(ctx, latest, { pendingTurn: undefined });
    }

    await startNextQueuedSessionMessage(ctx, args.sessionId);

    return null;
  },
});
