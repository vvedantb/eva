import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow, cancelTrackedWorkflow } from "./workflowManager";
import { ensureSandboxStartedSteps } from "./_sandbox_runtime/resumeSandboxSteps";
import { authAction, authMutation, hasRepoAccess } from "./functions";
import {
  aiModelValidator,
  getAIModelProvider,
  launchTraitsFromStored,
  reasoningLevelValidator,
  workflowCompleteValidator,
  normalizeAIModel,
  roleValidator,
  taskSandboxStatusValidator,
  turnCheckpointArgs,
  usesChatDaemon,
} from "./validators";
import {
  recordCompletionLog,
  sendCompletionEvent,
  clearStreamingActivity,
} from "./_taskWorkflow/helpers";
import { finalizeCancelledAssistantMessage } from "./streaming";
import { startNextQueuedProjectChatMessage } from "./_queues/helpers";
import {
  trackProjectChatWorkflow,
  PROJECT_CHAT_STREAM_PREFIX,
} from "./workflowWatchdog";
import { buildProjectChatPrompt } from "./_projects/chatPrompt";
import {
  buildProjectBranchName,
  getProjectGeneratedSpec,
} from "./_projects/helpers";
import { buildCustomInstructionsBlock } from "./prompts";
import { resolveMessageTokens } from "./_mentions/resolveMessageTokens";
import { notifyChatMentions } from "./_mentions/notifyChatMentions";
import { resolveCredentialSourceLabel } from "./_userProviderAccounts/credentialSource";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
  resolveTurnProviderAccountId,
} from "./_userProviderAccounts/defaults";
import type { Doc, Id } from "./_generated/dataModel";
import { PROJECT_CHAT_DAEMON_MUTATIONS } from "./_sandbox_runtime/daemonPaths";
import {
  formatDelayedPublishFailureError,
  resultTargetMessage,
} from "./_sessions/resultTarget";
import {
  applyChatTurnResult,
  finalizeOpenSyntheticTurnOnCancel,
  insertAssistantPlaceholderIfNeeded,
} from "./_chat/chatResult";
import {
  maybeInsertModelHandoffAlert,
  prependModelHandoffContext,
} from "./_shared/modelHandoff";

const CHAT_ALLOWED_TOOLS = "Read,Write,Edit,Bash,Glob,Grep";

async function buildProjectChatTurnPrompt(
  ctx: QueryCtx,
  args: {
    projectId: Id<"projects">;
    message: string;
    /** Model this turn runs on; decides whether a handoff catch-up is needed. */
    model: string;
    userId: Id<"users">;
  },
): Promise<{
  prompt: string;
  attachmentStorageIds: Id<"_storage">[] | undefined;
}> {
  const project = await ctx.db.get(args.projectId);
  if (!project) throw new Error("Project not found");

  const repo = await ctx.db.get(project.repoId);
  if (!repo) throw new Error("Repository not found");

  const triggeringUserMessage = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", args.projectId))
    .order("desc")
    .filter((q) => q.eq(q.field("role"), "user"))
    .first();

  const generatedSpec = await getProjectGeneratedSpec(ctx.db, args.projectId);
  const user = await ctx.db.get(args.userId);
  const customInstructionsBlock = buildCustomInstructionsBlock(
    user?.role ?? undefined,
    user?.customInstructions ?? undefined,
  );

  const { resolvedMessage, prefixBlock } = await resolveMessageTokens(
    ctx,
    args.message,
    project.repoId,
  );

  const branchName =
    project.branchName ??
    buildProjectBranchName(args.projectId, project.branchVersion);

  let prompt = buildProjectChatPrompt({
    repoOwner: repo.owner,
    repoName: repo.name,
    branchName,
    title: project.title,
    description: project.description,
    generatedSpec,
    message: resolvedMessage,
    rootDirectory: repo.rootDirectory ?? "",
    customInstructionsBlock,
    systemPrompt: repo.systemPrompt,
    devPort: project.devPort ?? repo.devPort,
  });
  if (prefixBlock) {
    prompt = `${prefixBlock}\n\n${prompt}`;
  }
  // Last, so the catch-up block leads the whole prompt.
  prompt = await prependModelHandoffContext(
    ctx,
    args.projectId,
    args.model,
    getAIModelProvider(project.model),
    prompt,
  );

  return {
    prompt,
    attachmentStorageIds: triggeringUserMessage?.attachmentStorageIds,
  };
}

/** Streaming-activity entity id for a project chat. */
function chatStreamEntityId(projectId: Id<"projects">): string {
  return `${PROJECT_CHAT_STREAM_PREFIX}${String(projectId)}`;
}

/**
 * Opens the assistant placeholder, stages the pending turn and starts the chat
 * workflow. Shared by the composer (`startExecute`) and the usage-limit retry
 * so the two cannot drift.
 */
async function stageAndStartProjectChatTurn(
  ctx: MutationCtx,
  params: {
    project: Doc<"projects">;
    actingUserId: Id<"users">;
    message: string;
    model: Infer<typeof aiModelValidator>;
    reasoningLevel?: Infer<typeof reasoningLevelValidator>;
    thinkingEnabled?: boolean;
    use1mContext?: boolean;
    fastMode?: boolean;
    /** Already resolved by the caller; undefined = Team. */
    providerAccountId: Id<"userProviderAccounts"> | undefined;
  },
): Promise<void> {
  const project = params.project;
  const projectId = project._id;
  const normalizedModel = normalizeAIModel(params.model);
  // Normalise exactly as the page-open prewarm does (`launchTraitsFromStored`
  // in `prewarmChatDaemon` below): the composer can send a model default
  // explicitly (e.g. reasoning "high", its display value), and forwarding it
  // verbatim gives this turn's prewarm and the workflow's prewarm a different
  // daemon opts sig from the page-open one — killing the daemon just booted.
  const launchTraits = launchTraitsFromStored(normalizedModel, {
    reasoningLevel: params.reasoningLevel,
    thinkingEnabled: params.thinkingEnabled,
    use1mContext: params.use1mContext,
    fastMode: params.fastMode,
  });

  await ctx.db.insert("messages", {
    parentId: projectId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    activityLog: "",
  });

  const { prompt, attachmentStorageIds } = await buildProjectChatTurnPrompt(
    ctx,
    {
      projectId,
      message: params.message,
      model: normalizedModel,
      userId: params.actingUserId,
    },
  );

  const usesDaemonPull = usesChatDaemon(normalizedModel);
  await ctx.db.patch(projectId, {
    ...(usesDaemonPull
      ? {
          pendingTurn: {
            prompt,
            requestedAt: Date.now(),
            attachmentStorageIds,
            model: normalizedModel,
          },
        }
      : { pendingTurn: undefined }),
    lastChatModel: normalizedModel,
    providerAccountId: params.providerAccountId,
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

  if (usesDaemonPull && project.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmEntityDaemon, {
      sandboxId: project.sandboxId,
      repoId: project.repoId,
      userId: params.actingUserId,
      entityId: String(projectId),
      streamingEntityId: chatStreamEntityId(projectId),
      entityIdField: "projectId",
      completionMutation: "projectChatWorkflow:handleCompletion",
      ...PROJECT_CHAT_DAEMON_MUTATIONS,
      model: normalizedModel,
      ...launchTraits,
      allowedTools: CHAT_ALLOWED_TOOLS,
      providerAccountId: params.providerAccountId,
      credentialOwnerUserId: project.userId,
      sessionPersistenceId: projectId,
      activeWorkflowField: "activeChatWorkflowId",
      skipPrewarm: false,
      entityTable: "projects",
    });
  }

  const workflowId = await workflow.start(
    ctx,
    internal.projectChatWorkflow.projectChatExecuteWorkflow,
    {
      projectId,
      message: params.message,
      model: params.model,
      // Same normalisation as the prewarm above: the workflow forwards these
      // straight back into `prewarmEntityDaemon`.
      ...launchTraits,
      providerAccountId: params.providerAccountId,
      credentialOwnerUserId: project.userId,
      userId: params.actingUserId,
    },
  );

  await trackProjectChatWorkflow(ctx, projectId, workflowId);
}

// --- Completion event ---

export const projectChatCompleteEvent = defineEvent({
  name: "projectChatComplete",
  validator: workflowCompleteValidator,
});

// --- Public mutations ---

/** Inserts a user chat message into the project conversation. */
export const addMessage = authMutation({
  args: {
    projectId: v.id("projects"),
    // Defaults to "user". "assistant" lets the client surface a failed send
    // as a visible error message (same contract as sessions.addMessage).
    role: v.optional(roleValidator),
    content: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    model: v.optional(aiModelValidator),
    reasoningLevel: v.optional(reasoningLevelValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const role = args.role ?? "user";
    const providerAccountId =
      role === "user"
        ? await resolveTurnProviderAccountId(ctx.db, {
            requestedAccountId: args.providerAccountId,
            ownerUserId: project.userId,
            currentAccountId: project.providerAccountId,
            model: args.model ?? project.lastChatModel ?? project.model,
            senderUserId: ctx.userId,
            changePolicy: "owner-only",
            ownerNoun: "project owner",
          })
        : undefined;
    await ctx.db.insert("messages", {
      parentId: args.projectId,
      role,
      content: args.content,
      timestamp: Date.now(),
      userId: ctx.userId,
      attachmentStorageIds: args.attachmentStorageIds,
      ...(role === "user"
        ? {
            credentialSourceLabel: await resolveCredentialSourceLabel(
              ctx.db,
              providerAccountId,
              project.userId,
            ),
            model: args.model,
            reasoningLevel: args.reasoningLevel,
          }
        : {}),
    });
    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    return null;
  },
});

/** Starts a project chat workflow on the project's existing sandbox. */
export const startExecute = authMutation({
  args: {
    projectId: v.id("projects"),
    message: v.string(),
    model: aiModelValidator,
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const normalizedModel = normalizeAIModel(args.model);
    const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: args.providerAccountId,
      ownerUserId: project.userId,
      currentAccountId: project.providerAccountId,
      model: normalizedModel,
      senderUserId: ctx.userId,
      changePolicy: "owner-only",
      ownerNoun: "project owner",
    });

    await notifyChatMentions(ctx, {
      content: args.message,
      authorUserId: ctx.userId,
      surface: { kind: "project", project },
    });

    // The user row for this turn is already stored (the client sends addMessage
    // first), so the alert lands above the new placeholder, not below the reply.
    await maybeInsertModelHandoffAlert(
      ctx,
      args.projectId,
      normalizedModel,
      getAIModelProvider(project.model),
    );

    await stageAndStartProjectChatTurn(ctx, {
      project,
      actingUserId: ctx.userId,
      message: args.message,
      model: args.model,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
      providerAccountId,
    });

    return null;
  },
});

/**
 * Re-run the last user prompt on a different provider account after a
 * usage-limit failure. No new user bubble: the original message stays, its
 * credential label moves to the new account, and a fresh placeholder opens
 * below the failed reply — which dismisses the recovery banner because the
 * failed reply is no longer the newest message. Same model and reasoning as
 * the failed turn; other traits come from the project's sticky fields.
 */
export const retryLastTurnWithAccount = authMutation({
  args: {
    projectId: v.id("projects"),
    /** null = the team credential. */
    providerAccountId: v.union(v.id("userProviderAccounts"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    // Project chat is owner-sticky: only the owner picks the billed account
    // (the "owner-only" policy in `resolveTurnProviderAccountId`).
    if (ctx.userId !== project.userId) {
      throw new Error("Only the project owner can change the provider account");
    }
    if (
      project.activeChatWorkflowId !== undefined ||
      project.pendingTurn !== undefined
    ) {
      throw new Error("A turn is already running");
    }

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.projectId))
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

    const model = normalizeAIModel(
      userMessage.model ?? project.lastChatModel ?? project.model,
    );
    // null = Team. A concrete account must be usable by the owner and is
    // reconciled to the model's provider like every other turn.
    const providerAccountId =
      args.providerAccountId === null
        ? undefined
        : await reconcileProviderAccountForModel(
            ctx.db,
            project.userId,
            model,
            await assertProviderAccountUsableBy(
              ctx.db,
              args.providerAccountId,
              project.userId,
            ),
          );

    await ctx.db.patch(userMessage._id, {
      credentialSourceLabel: await resolveCredentialSourceLabel(
        ctx.db,
        providerAccountId,
        project.userId,
      ),
    });

    // No attachment handling needed: `buildProjectChatTurnPrompt` reads the
    // newest user message's attachments itself.
    await stageAndStartProjectChatTurn(ctx, {
      project,
      actingUserId: ctx.userId,
      message: userMessage.content,
      model,
      reasoningLevel: userMessage.reasoningLevel ?? project.lastReasoningLevel,
      thinkingEnabled: project.lastThinkingEnabled,
      use1mContext: project.lastUse1mContext,
      fastMode: project.lastFastMode,
      providerAccountId,
    });
    console.log(
      `[project-chat] retryLastTurnWithAccount projectId=${args.projectId} providerAccountId=${String(args.providerAccountId)}`,
    );
    return null;
  },
});

/** Queues a chat message to run after the current workflow finishes. */
export const enqueueMessage = authMutation({
  args: {
    projectId: v.id("projects"),
    message: v.string(),
    model: aiModelValidator,
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const content = args.message.trim();
    if (!content) return null;

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const normalizedModel = normalizeAIModel(args.model);
    const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: args.providerAccountId,
      ownerUserId: project.userId,
      currentAccountId: project.providerAccountId,
      model: normalizedModel,
      senderUserId: ctx.userId,
      changePolicy: "owner-only",
      ownerNoun: "project owner",
    });

    await notifyChatMentions(ctx, {
      content,
      authorUserId: ctx.userId,
      surface: { kind: "project", project },
    });

    await ctx.db.insert("queuedMessages", {
      parentId: args.projectId,
      content,
      createdAt: Date.now(),
      order: Date.now(),
      userId: ctx.userId,
      model: args.model,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
      // The sender's raw pick, re-resolved against the owner's accounts at
      // dequeue: the model and the owner's accounts can both move while the
      // message waits.
      providerAccountId: args.providerAccountId,
      attachmentStorageIds: args.attachmentStorageIds,
    });
    await ctx.db.patch(args.projectId, {
      lastChatModel: normalizedModel,
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
 * Cancels the active project chat workflow and starts any queued message. For
 * a daemon-backed turn, sets `cancelRequestedAt` so the warm provider process
 * interrupts its own in-flight turn on its next `claimPendingTurn` poll.
 * One-shot providers retain the process-kill path.
 */
export const cancelExecution = authMutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await cancelTrackedWorkflow(ctx, project.activeChatWorkflowId);

    const workflowIdToCancel = project.activeChatWorkflowId;
    const pendingRequestedAt = project.pendingTurn?.requestedAt;

    if (usesChatDaemon(project.lastChatModel ?? project.model)) {
      await ctx.db.patch(args.projectId, { cancelRequestedAt: Date.now() });
    } else if (project.sandboxId) {
      if (project.activeWorkflowId || project.activeBuildWorkflowId) {
        await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
          sandboxId: project.sandboxId,
          repoId: project.repoId,
          entityIdField: "projectId",
          entityId: String(args.projectId),
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
          sandboxId: project.sandboxId,
          repoId: project.repoId,
        });
      }
    }

    const streamingEntityId = chatStreamEntityId(args.projectId);
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
      .first();

    const latest = await ctx.db.get(args.projectId);
    if (!latest) return null;

    const newerTurnStaged =
      latest.pendingTurn !== undefined &&
      latest.pendingTurn.requestedAt !== pendingRequestedAt;
    const newerWorkflowTracked =
      latest.activeChatWorkflowId !== undefined &&
      latest.activeChatWorkflowId !== workflowIdToCancel;

    if (!newerTurnStaged && !newerWorkflowTracked) {
      const syntheticTurnMessageId = latest.syntheticTurnMessageId;
      const last = await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", args.projectId))
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
    }

    await clearStreamingActivity(ctx, streamingEntityId);

    const projectPatch: {
      activeChatWorkflowId?: undefined;
      pendingTurn?: undefined;
      pendingTurnClaimedAt?: undefined;
      syntheticTurnMessageId?: undefined;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (
      workflowIdToCancel !== undefined &&
      latest.activeChatWorkflowId === workflowIdToCancel
    ) {
      projectPatch.activeChatWorkflowId = undefined;
    }
    if (
      pendingRequestedAt !== undefined &&
      latest.pendingTurn?.requestedAt === pendingRequestedAt
    ) {
      projectPatch.pendingTurn = undefined;
    }
    if (!newerTurnStaged && !newerWorkflowTracked) {
      projectPatch.syntheticTurnMessageId = undefined;
      // This cancel owns the current turn and nothing newer has arrived, so the
      // claim stamp is spent. See `_chat/pendingTurnRestage.ts`.
      projectPatch.pendingTurnClaimedAt = undefined;
    }

    await ctx.db.patch(args.projectId, projectPatch);

    await startNextQueuedProjectChatMessage(ctx, args.projectId);
    return null;
  },
});

// --- Workflow definition ---

/** Runs a single chat message through the project's existing sandbox agent. */
export const projectChatExecuteWorkflow = workflow.define({
  args: {
    projectId: v.id("projects"),
    message: v.string(),
    model: aiModelValidator,
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    credentialOwnerUserId: v.optional(v.id("users")),
    userId: v.id("users"),
  },
  handler: async (step, args): Promise<void> => {
    const saveFailure = (error: string) =>
      step.runMutation(internal.projectChatWorkflow.saveResult, {
        projectId: args.projectId,
        success: false,
        result: null,
        error,
        activityLog: null,
      });

    await step.runMutation(
      internal.projectChatWorkflow.addAssistantPlaceholder,
      {
        projectId: args.projectId,
      },
    );

    const data = await step.runQuery(internal.projectChatWorkflow.getChatData, {
      projectId: args.projectId,
      message: args.message,
      model: args.model,
      userId: args.userId,
    });

    if (!data.sandboxId) {
      await saveFailure(
        "No active sandbox. Start the project sandbox before sending chat messages.",
      );
      return;
    }

    const streamingEntityId = chatStreamEntityId(args.projectId);

    // Bring an archived/stopped sandbox back to "started" via durable polling
    // steps before validating, so a multi-minute cold-storage thaw doesn't blow
    // the per-action 10-minute limit. Once started, validate hits its fast path.
    let started: Awaited<ReturnType<typeof ensureSandboxStartedSteps>>;
    try {
      started = await ensureSandboxStartedSteps(step, {
        sandboxId: data.sandboxId,
        repoId: data.repoId,
        streamingEntityId,
        sandboxRunning: data.sandboxStatus === "active",
      });
    } catch (error) {
      await saveFailure(
        error instanceof Error
          ? error.message
          : "Project sandbox could not be restored from cold storage. Please retry.",
      );
      return;
    }

    const activeSandboxId = started.thawId;
    if (!activeSandboxId) {
      await saveFailure(
        "No active sandbox. Start the project sandbox before sending chat messages.",
      );
      return;
    }

    const validation = await step.runAction(
      internal.sandbox.validateSandbox,
      { sandboxId: activeSandboxId, repoId: data.repoId },
      { retry: false },
    );

    if (!validation.healthy) {
      await saveFailure(
        "Project sandbox is no longer reachable. Restart it from the sandbox panel.",
      );
      return;
    }

    if (usesChatDaemon(data.model)) {
      await step.runMutation(internal.projectChatWorkflow.ensurePendingTurn, {
        projectId: args.projectId,
        prompt: data.prompt,
        attachmentStorageIds: data.attachmentStorageIds,
        model: args.model,
      });

      await step.runAction(internal.sandbox.prewarmEntityDaemon, {
        sandboxId: activeSandboxId,
        repoId: data.repoId,
        userId: args.userId,
        entityId: String(args.projectId),
        streamingEntityId,
        entityIdField: "projectId",
        completionMutation: "projectChatWorkflow:handleCompletion",
        ...PROJECT_CHAT_DAEMON_MUTATIONS,
        model: data.model,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
        allowedTools: CHAT_ALLOWED_TOOLS,
        providerAccountId: args.providerAccountId,
        credentialOwnerUserId: args.credentialOwnerUserId,
        sessionPersistenceId: args.projectId,
        activeWorkflowField: "activeChatWorkflowId",
        skipPrewarm: false,
        entityTable: "projects",
      });
    } else {
      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId: activeSandboxId,
        entityId: args.projectId,
        prompt: data.prompt,
        userId: args.userId,
        completionMutation: "projectChatWorkflow:handleCompletion",
        entityIdField: "projectId",
        model: data.model,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
        providerAccountId: args.providerAccountId,
        credentialOwnerUserId: args.credentialOwnerUserId,
        allowedTools: CHAT_ALLOWED_TOOLS,
        repoId: data.repoId,
        sessionPersistenceId: args.projectId,
        streamingEntityId,
        attachmentStorageIds: data.attachmentStorageIds,
      });
    }

    const result = await step.awaitEvent(projectChatCompleteEvent);

    await step.runMutation(internal.projectChatWorkflow.saveResult, {
      projectId: args.projectId,
      success: result.success,
      result: result.result,
      error: result.error,
      activityLog: result.activityLog,
      model: args.model,
      pendingQuestion: result.pendingQuestion,
    });

    if (result.success && activeSandboxId && data.branchName) {
      try {
        await step.runAction(internal.sandbox.pushSandboxBranch, {
          sandboxId: activeSandboxId,
          installationId: data.installationId,
          repoOwner: data.repoOwner,
          repoName: data.repoName,
          repoId: data.repoId,
          branchName: data.branchName,
        });
      } catch (error) {
        const publishError = formatDelayedPublishFailureError("chat", error);
        console.error(
          `[projectChatWorkflow] pushSandboxBranch failed projectId=${String(args.projectId)}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await step.runMutation(internal.projectChatWorkflow.saveResult, {
          projectId: args.projectId,
          success: false,
          result: result.result,
          error: publishError,
          activityLog: result.activityLog,
          pendingQuestion: result.pendingQuestion,
        });
      }
    }
  },
});

// --- Supporting internal functions ---

/** Inserts an empty assistant message into the project chat for streaming updates. */
export const addAssistantPlaceholder = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    await insertAssistantPlaceholderIfNeeded(ctx, {
      parentId: args.projectId,
      recentLimit: 5,
      skipSystemAlerts: false,
    });
    return null;
  },
});

/** Fetches project + repo data and builds the chat prompt. */
export const getChatData = internalQuery({
  args: {
    projectId: v.id("projects"),
    message: v.string(),
    model: aiModelValidator,
    userId: v.id("users"),
  },
  returns: v.object({
    sandboxId: v.optional(v.string()),
    sandboxStatus: v.optional(taskSandboxStatusValidator),
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    installationId: v.number(),
    branchName: v.string(),
    prompt: v.string(),
    model: aiModelValidator,
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const { prompt, attachmentStorageIds } = await buildProjectChatTurnPrompt(
      ctx,
      {
        projectId: args.projectId,
        message: args.message,
        model: args.model,
        userId: args.userId,
      },
    );

    const branchName =
      project.branchName ??
      buildProjectBranchName(args.projectId, project.branchVersion);

    return {
      sandboxId: project.sandboxId,
      sandboxStatus: project.reviewProjectSandboxStatus,
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: project.repoId,
      installationId: repo.installationId,
      branchName,
      prompt,
      model: normalizeAIModel(args.model),
      attachmentStorageIds,
    };
  },
});

/** Saves the chat result, finalising the last assistant message and starting the next queued message. */
export const saveResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    /** Stamped onto the reply on success, making it this provider's checkpoint. */
    model: v.optional(aiModelValidator),
    pendingQuestion: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const outcome = await applyChatTurnResult(ctx, {
      parentId: args.projectId,
      streamingEntityId: chatStreamEntityId(args.projectId),
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
      alertTitle: "Failed to publish project branch",
      pendingQuestion: args.pendingQuestion,
      model: args.model,
    });
    if (outcome === "publish-failure") return null;

    await ctx.db.patch(args.projectId, {
      activeChatWorkflowId: undefined,
      // The turn is over, so the claim stamp has nothing left to vouch for.
      // See `_chat/pendingTurnRestage.ts`.
      pendingTurnClaimedAt: undefined,
      updatedAt: Date.now(),
      lastSandboxActivity: Date.now(),
    });

    await startNextQueuedProjectChatMessage(ctx, args.projectId);
    return null;
  },
});

/** Receives sandbox completion callback and forwards the event to the active chat workflow. */
export const handleCompletion = authMutation({
  args: {
    projectId: v.id("projects"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    pendingQuestion: v.optional(v.string()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !project.activeChatWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    if (
      project.pendingTurn !== undefined ||
      project.pendingTurnClaimedAt !== undefined
    ) {
      await ctx.db.patch(args.projectId, {
        pendingTurn: undefined,
        pendingTurnClaimedAt: undefined,
      });
    }

    await sendCompletionEvent(
      ctx,
      projectChatCompleteEvent,
      project.activeChatWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
        pendingQuestion: args.pendingQuestion,
      },
    );

    await recordCompletionLog(ctx, {
      entityType: "project-chat",
      entityId: String(args.projectId),
      entityTitle: project.title,
      repoId: project.repoId,
      rawResultEvent: args.rawResultEvent,
      projectId: args.projectId,
    });

    return null;
  },
});

/** Fired when the project sandbox chat view opens to warm the chat daemon. */
export const prewarmChatDaemon = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.sandboxId) return null;
    // Never prewarm a stopped/stopping sandbox. prewarmEntityDaemon execs on
    // the sandbox, and on Vercel any exec lazily resumes a stopped VM —
    // resurrecting a sandbox the user stopped, invisibly (same guard as
    // sessions' prewarmDaemon).
    if (
      project.reviewProjectSandboxStatus === "closed" ||
      project.reviewProjectSandboxStatus === "stopping"
    ) {
      return null;
    }
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const normalizedModel = normalizeAIModel(
      project.lastChatModel ?? project.model,
    );
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmEntityDaemon, {
      sandboxId: project.sandboxId,
      repoId: project.repoId,
      userId: project.userId,
      entityId: String(args.projectId),
      streamingEntityId: chatStreamEntityId(args.projectId),
      entityIdField: "projectId",
      completionMutation: "projectChatWorkflow:handleCompletion",
      ...PROJECT_CHAT_DAEMON_MUTATIONS,
      model: normalizedModel,
      // Forward the sticky traits normalised through the same helper as the
      // composer so the prewarm's opts sig matches the turn path. The send path
      // omits defaults, so passing the stored values verbatim (e.g. reasoning
      // "high", the Claude default, or `fastMode: false` on a model with no Fast
      // trait) mismatches a trait-launched daemon and kill+respawns it on every
      // page open (see sessions' prewarmDaemon).
      ...launchTraitsFromStored(normalizedModel, {
        reasoningLevel: project.lastReasoningLevel,
        thinkingEnabled: project.lastThinkingEnabled,
        use1mContext: project.lastUse1mContext,
        fastMode: project.lastFastMode,
      }),
      allowedTools: CHAT_ALLOWED_TOOLS,
      providerAccountId: project.providerAccountId,
      credentialOwnerUserId: project.userId,
      sessionPersistenceId: args.projectId,
      activeWorkflowField: "activeChatWorkflowId",
      skipPrewarm: false,
      entityTable: "projects",
    });
    return null;
  },
});

/**
 * Waits for account-switch prewarming to finish before the composer is
 * re-enabled, preventing the previous credential daemon from claiming the next
 * turn during its replacement window.
 */
export const prewarmChatDaemonNow = authAction({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.projectChatWorkflow.getChatPrewarmData,
      { projectId: args.projectId, userId: ctx.userId },
    );
    if (!data) return null;
    await ctx.runAction(internal.sandbox.prewarmEntityDaemon, {
      sandboxId: data.sandboxId,
      repoId: data.repoId,
      userId: data.ownerUserId,
      entityId: String(args.projectId),
      streamingEntityId: chatStreamEntityId(args.projectId),
      entityIdField: "projectId",
      completionMutation: "projectChatWorkflow:handleCompletion",
      ...PROJECT_CHAT_DAEMON_MUTATIONS,
      model: data.model,
      reasoningLevel: data.reasoningLevel,
      thinkingEnabled: data.thinkingEnabled,
      use1mContext: data.use1mContext,
      fastMode: data.fastMode,
      allowedTools: CHAT_ALLOWED_TOOLS,
      providerAccountId: data.providerAccountId,
      credentialOwnerUserId: data.ownerUserId,
      sessionPersistenceId: args.projectId,
      activeWorkflowField: "activeChatWorkflowId",
      skipPrewarm: false,
      entityTable: "projects",
    });
    return null;
  },
});

export const getChatPrewarmData = internalQuery({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  returns: v.union(
    v.null(),
    v.object({
      sandboxId: v.string(),
      repoId: v.id("githubRepos"),
      ownerUserId: v.id("users"),
      model: aiModelValidator,
      reasoningLevel: v.optional(reasoningLevelValidator),
      thinkingEnabled: v.optional(v.boolean()),
      use1mContext: v.optional(v.boolean()),
      fastMode: v.optional(v.boolean()),
      providerAccountId: v.optional(v.id("userProviderAccounts")),
    }),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, args.userId))) {
      throw new Error("Not authorized");
    }
    if (
      !project.sandboxId ||
      project.reviewProjectSandboxStatus === "closed" ||
      project.reviewProjectSandboxStatus === "stopping"
    ) {
      return null;
    }
    const normalizedModel = normalizeAIModel(
      project.lastChatModel ?? project.model,
    );
    return {
      sandboxId: project.sandboxId,
      repoId: project.repoId,
      ownerUserId: project.userId,
      model: normalizedModel,
      // Normalised here, not in the caller: the traits must be exactly what the
      // composer sends (defaults omitted) or the prewarm's opts sig differs from
      // the turn path's and kills the warm daemon.
      ...launchTraitsFromStored(normalizedModel, {
        reasoningLevel: project.lastReasoningLevel,
        thinkingEnabled: project.lastThinkingEnabled,
        use1mContext: project.lastUse1mContext,
        fastMode: project.lastFastMode,
      }),
      providerAccountId: project.providerAccountId,
    };
  },
});

export {
  claimPendingTurn,
  completeSyntheticTurn,
  ensurePendingTurn,
  handleStaleSyntheticTurn,
  openSyntheticTurn,
  requestStopBackgroundAgent,
  updateBackgroundAgents,
} from "./_chat/projectChatDaemon";
