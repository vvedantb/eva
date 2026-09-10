import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow, cancelTrackedWorkflow } from "./workflowManager";
import { ensureSandboxStartedSteps } from "./_sandbox_runtime/resumeSandboxSteps";
import { decideSandboxStartPlan } from "./mcp/orchestratorDelivery";
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
  resolveTaskBranchName,
} from "./_taskWorkflow/helpers";
import { resolveTaskWorkflowBaseBranchForTask } from "./_taskWorkflow/resolveBaseBranch";
import { seedSandboxStartupActivity } from "./_sandbox/startupActivity";
import { finalizeCancelledAssistantMessage } from "./streaming";
import { startNextQueuedTaskChatMessage } from "./_queues/helpers";
import {
  trackAgentTaskChatWorkflow,
  TASK_CHAT_STREAM_PREFIX,
} from "./workflowWatchdog";
import { buildAgentTaskChatPrompt } from "./_agentTasks/chatPrompt";
import { listReadableSiblingRepos } from "./_githubRepos/sandboxRead";
import { buildCustomInstructionsBlock } from "./prompts";
import { resolveMessageTokens } from "./_mentions/resolveMessageTokens";
import { notifyChatMentions } from "./_mentions/notifyChatMentions";
import { resolveCredentialSourceLabel } from "./_userProviderAccounts/credentialSource";
import { resolveTurnProviderAccountId } from "./_userProviderAccounts/defaults";
import type { Id } from "./_generated/dataModel";
import { TASK_CHAT_DAEMON_MUTATIONS } from "./_sandbox_runtime/daemonPaths";
import { formatDelayedPublishFailureError } from "./_sessions/resultTarget";
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

/** Streaming-activity entity id for a task chat. */
function chatStreamEntityId(taskId: Id<"agentTasks">): string {
  return `${TASK_CHAT_STREAM_PREFIX}${String(taskId)}`;
}

async function buildTaskChatTurnPrompt(
  ctx: QueryCtx,
  args: {
    taskId: Id<"agentTasks">;
    message: string;
    /** Model this turn runs on; decides whether a handoff catch-up is needed. */
    model: string;
    userId: Id<"users">;
  },
): Promise<{
  prompt: string;
  attachmentStorageIds: Id<"_storage">[] | undefined;
}> {
  const task = await ctx.db.get(args.taskId);
  if (!task) throw new Error("Task not found");
  if (!task.repoId) throw new Error("Task is not associated with a repo");

  const repo = await ctx.db.get(task.repoId);
  if (!repo) throw new Error("Repository not found");

  const triggeringUserMessage = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", args.taskId))
    .order("desc")
    .filter((q) => q.eq(q.field("role"), "user"))
    .first();

  const user = await ctx.db.get(args.userId);
  const customInstructionsBlock = buildCustomInstructionsBlock(
    user?.role ?? undefined,
    user?.customInstructions ?? undefined,
  );

  const { resolvedMessage, prefixBlock } = await resolveMessageTokens(
    ctx,
    args.message,
    task.repoId,
  );

  const branchName = await resolveTaskBranchName(ctx.db, task);

  // Sibling repositories this sandbox's git credentials can read (owner is the
  // task owner, whose access the credential helper mints tokens against).
  const readableRepos = await listReadableSiblingRepos(
    ctx.db,
    task.createdBy,
    repo._id,
  );

  let prompt = buildAgentTaskChatPrompt({
    repoOwner: repo.owner,
    repoName: repo.name,
    branchName,
    title: task.title,
    description: task.description,
    tags: task.tags,
    taskNumber: task.taskNumber,
    status: task.status,
    message: resolvedMessage,
    rootDirectory: repo.rootDirectory ?? "",
    customInstructionsBlock,
    systemPrompt: repo.systemPrompt,
    devPort: task.devPort ?? repo.devPort,
    readableRepos,
  });
  if (prefixBlock) {
    prompt = `${prefixBlock}\n\n${prompt}`;
  }
  // Last, so the catch-up block leads the whole prompt.
  prompt = await prependModelHandoffContext(
    ctx,
    args.taskId,
    args.model,
    getAIModelProvider(task.model),
    prompt,
  );

  return {
    prompt,
    attachmentStorageIds: triggeringUserMessage?.attachmentStorageIds,
  };
}

// --- Completion event ---

export const agentTaskChatCompleteEvent = defineEvent({
  name: "agentTaskChatComplete",
  validator: workflowCompleteValidator,
});

// --- Public mutations ---

/** Inserts a user chat message into the task conversation. */
export const addMessage = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    // Defaults to "user". "assistant" lets the client surface a failed send
    // as a visible error message (same contract as sessions.addMessage).
    role: v.optional(roleValidator),
    content: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    model: v.optional(aiModelValidator),
    reasoningLevel: v.optional(reasoningLevelValidator),
    /** Set by the orchestrator's `send_agent_message` MCP tool. */
    sentViaOrchestrator: v.optional(v.boolean()),
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
    const role = args.role ?? "user";
    const providerAccountId =
      role === "user"
        ? await resolveTurnProviderAccountId(ctx.db, {
            requestedAccountId: args.providerAccountId,
            ownerUserId: task.createdBy,
            currentAccountId: task.providerAccountId,
            model: args.model ?? task.lastChatModel ?? task.model,
            senderUserId: ctx.userId,
            changePolicy: "owner-only",
            ownerNoun: "task owner",
          })
        : undefined;
    await ctx.db.insert("messages", {
      parentId: args.taskId,
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
              task.createdBy,
            ),
            model: args.model,
            reasoningLevel: args.reasoningLevel,
            sentViaOrchestrator: args.sentViaOrchestrator,
          }
        : {}),
    });
    await ctx.db.patch(args.taskId, { updatedAt: Date.now() });
    return null;
  },
});

/** Starts a task chat workflow on the task's existing sandbox. */
export const startExecute = authMutation({
  args: {
    taskId: v.id("agentTasks"),
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
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (
      !task.repoId ||
      !(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))
    ) {
      throw new Error("Not authorized");
    }

    const normalizedModel = normalizeAIModel(args.model);
    // Normalise exactly as the page-open prewarm does (`launchTraitsFromStored`
    // in `prewarmChatDaemon` below): the composer can send a model default
    // explicitly (e.g. reasoning "high", its display value), and forwarding it
    // verbatim gives this turn's prewarm and the workflow's prewarm a different
    // daemon opts sig from the page-open one — killing the daemon just booted.
    const launchTraits = launchTraitsFromStored(normalizedModel, {
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
    });
    const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: args.providerAccountId,
      ownerUserId: task.createdBy,
      currentAccountId: task.providerAccountId,
      model: normalizedModel,
      senderUserId: ctx.userId,
      changePolicy: "owner-only",
      ownerNoun: "task owner",
    });

    await notifyChatMentions(ctx, {
      content: args.message,
      authorUserId: ctx.userId,
      surface: { kind: "task", task },
    });

    // The user row for this turn is already stored (the client sends addMessage
    // first), so the alert lands above the new placeholder, not below the reply.
    await maybeInsertModelHandoffAlert(
      ctx,
      args.taskId,
      normalizedModel,
      getAIModelProvider(task.model),
    );

    await ctx.db.insert("messages", {
      parentId: args.taskId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      activityLog: "",
    });

    const { prompt, attachmentStorageIds } = await buildTaskChatTurnPrompt(
      ctx,
      {
        taskId: args.taskId,
        message: args.message,
        model: normalizedModel,
        userId: ctx.userId,
      },
    );

    const usesDaemonPull = usesChatDaemon(normalizedModel);
    await ctx.db.patch(args.taskId, {
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

    if (
      usesDaemonPull &&
      task.sandboxId &&
      task.repoId &&
      task.reviewTaskSandboxStatus !== "closed" &&
      task.reviewTaskSandboxStatus !== "stopping"
    ) {
      await ctx.scheduler.runAfter(0, internal.sandbox.prewarmEntityDaemon, {
        sandboxId: task.sandboxId,
        repoId: task.repoId,
        userId: ctx.userId,
        entityId: String(args.taskId),
        streamingEntityId: chatStreamEntityId(args.taskId),
        entityIdField: "taskId",
        completionMutation: "agentTaskChatWorkflow:handleCompletion",
        ...TASK_CHAT_DAEMON_MUTATIONS,
        model: normalizedModel,
        ...launchTraits,
        allowedTools: CHAT_ALLOWED_TOOLS,
        providerAccountId,
        credentialOwnerUserId: task.createdBy,
        sessionPersistenceId: args.taskId,
        activeWorkflowField: "activeChatWorkflowId",
        skipPrewarm: false,
        entityTable: "agentTasks",
      });
    }

    const workflowId = await workflow.start(
      ctx,
      internal.agentTaskChatWorkflow.agentTaskChatExecuteWorkflow,
      {
        taskId: args.taskId,
        message: args.message,
        model: args.model,
        // Same normalisation as the prewarm above: the workflow forwards these
        // straight back into `prewarmEntityDaemon`.
        ...launchTraits,
        providerAccountId,
        credentialOwnerUserId: task.createdBy,
        userId: ctx.userId,
      },
    );

    await trackAgentTaskChatWorkflow(ctx, args.taskId, workflowId);
    return null;
  },
});

/** Queues a chat message to run after the current workflow finishes. */
export const enqueueMessage = authMutation({
  args: {
    taskId: v.id("agentTasks"),
    message: v.string(),
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

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (
      !task.repoId ||
      !(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))
    ) {
      throw new Error("Not authorized");
    }

    const normalizedModel = normalizeAIModel(args.model);
    const providerAccountId = await resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: args.providerAccountId,
      ownerUserId: task.createdBy,
      currentAccountId: task.providerAccountId,
      model: normalizedModel,
      senderUserId: ctx.userId,
      changePolicy: "owner-only",
      ownerNoun: "task owner",
    });

    await notifyChatMentions(ctx, {
      content,
      authorUserId: ctx.userId,
      surface: { kind: "task", task },
    });

    await ctx.db.insert("queuedMessages", {
      parentId: args.taskId,
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
      sentViaOrchestrator: args.sentViaOrchestrator,
    });
    await ctx.db.patch(args.taskId, {
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
 * Cancels the active task chat workflow and starts any queued message. For a
 * daemon-backed turn, sets `cancelRequestedAt` so the warm provider process
 * interrupts its own in-flight turn on its next `claimPendingTurn` poll.
 * One-shot providers retain the process-kill path.
 */
export const cancelExecution = authMutation({
  args: {
    taskId: v.id("agentTasks"),
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

    await cancelTrackedWorkflow(ctx, task.activeChatWorkflowId);

    const workflowIdToCancel = task.activeChatWorkflowId;
    const pendingRequestedAt = task.pendingTurn?.requestedAt;

    if (usesChatDaemon(task.lastChatModel ?? task.model)) {
      await ctx.db.patch(args.taskId, { cancelRequestedAt: Date.now() });
    } else if (task.sandboxId && task.repoId) {
      if (task.activeWorkflowId) {
        await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
          sandboxId: task.sandboxId,
          repoId: task.repoId,
          entityIdField: "taskId",
          entityId: String(args.taskId),
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
          sandboxId: task.sandboxId,
          repoId: task.repoId,
        });
      }
    }

    const streamingEntityId = chatStreamEntityId(args.taskId);
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
      .first();

    const latest = await ctx.db.get(args.taskId);
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
        .withIndex("by_parent", (q) => q.eq("parentId", args.taskId))
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

    const taskPatch: {
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
      taskPatch.activeChatWorkflowId = undefined;
    }
    if (
      pendingRequestedAt !== undefined &&
      latest.pendingTurn?.requestedAt === pendingRequestedAt
    ) {
      taskPatch.pendingTurn = undefined;
    }
    if (!newerTurnStaged && !newerWorkflowTracked) {
      taskPatch.syntheticTurnMessageId = undefined;
      // This cancel owns the current turn and nothing newer has arrived, so the
      // claim stamp is spent. See `_chat/pendingTurnRestage.ts`.
      taskPatch.pendingTurnClaimedAt = undefined;
    }

    await ctx.db.patch(args.taskId, taskPatch);

    await startNextQueuedTaskChatMessage(ctx, args.taskId);
    return null;
  },
});

// --- Workflow definition ---

/** Runs a single chat message through the task's existing sandbox agent. */
export const agentTaskChatExecuteWorkflow = workflow.define({
  args: {
    taskId: v.id("agentTasks"),
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
    await step.runMutation(
      internal.agentTaskChatWorkflow.addAssistantPlaceholder,
      { taskId: args.taskId },
    );

    let data = await step.runQuery(internal.agentTaskChatWorkflow.getChatData, {
      taskId: args.taskId,
      message: args.message,
      model: args.model,
      userId: args.userId,
    });

    const sandboxPlan = decideSandboxStartPlan(data.sandboxStatus);
    if (sandboxPlan !== "run") {
      if (sandboxPlan === "start") {
        await step.runMutation(
          internal.agentTaskChatWorkflow.markTaskSandboxStartingForChat,
          { taskId: args.taskId },
        );
        try {
          await step.runAction(internal.sandbox.startTaskPreviewSandbox, {
            taskId: args.taskId,
            existingSandboxId: data.sandboxId,
            installationId: data.installationId,
            repoOwner: data.repoOwner,
            repoName: data.repoName,
            branchName: `eva/task-${args.taskId}`,
            baseBranch: data.baseBranch,
            repoId: data.repoId,
          });
        } catch (error) {
          await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
            taskId: args.taskId,
            success: false,
            result: null,
            error:
              error instanceof Error
                ? error.message
                : "Task sandbox could not be started. Please retry.",
            activityLog: null,
          });
          return;
        }
      } else {
        const waited = await step.runAction(
          internal._agentTasks.sandbox.waitForTaskPreviewSandboxActive,
          { taskId: args.taskId },
        );
        if (!waited.ready) {
          await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
            taskId: args.taskId,
            success: false,
            result: null,
            error:
              "Task sandbox did not become ready. Start it from the sandbox panel and retry.",
            activityLog: null,
          });
          return;
        }
      }
      data = await step.runQuery(internal.agentTaskChatWorkflow.getChatData, {
        taskId: args.taskId,
        message: args.message,
        model: args.model,
        userId: args.userId,
      });
      if (decideSandboxStartPlan(data.sandboxStatus) !== "run") {
        await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
          taskId: args.taskId,
          success: false,
          result: null,
          error:
            "Task sandbox did not become ready. Start it from the sandbox panel and retry.",
          activityLog: null,
        });
        return;
      }
    }

    if (!data.sandboxId) {
      await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
        taskId: args.taskId,
        success: false,
        result: null,
        error:
          "No active sandbox. Start the task sandbox before sending chat messages.",
        activityLog: null,
      });
      return;
    }

    const streamingEntityId = chatStreamEntityId(args.taskId);

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
      await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
        taskId: args.taskId,
        success: false,
        result: null,
        error:
          error instanceof Error
            ? error.message
            : "Task sandbox could not be restored from cold storage. Please retry.",
        activityLog: null,
      });
      return;
    }

    const activeSandboxId = started.thawId;
    if (!activeSandboxId) {
      await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
        taskId: args.taskId,
        success: false,
        result: null,
        error:
          "No active sandbox. Start the task sandbox before sending chat messages.",
        activityLog: null,
      });
      return;
    }

    const validation = await step.runAction(
      internal.sandbox.validateSandbox,
      { sandboxId: activeSandboxId, repoId: data.repoId },
      { retry: false },
    );

    if (!validation.healthy) {
      await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
        taskId: args.taskId,
        success: false,
        result: null,
        error:
          "Task sandbox is no longer reachable. Restart it from the sandbox panel.",
        activityLog: null,
      });
      return;
    }

    if (usesChatDaemon(data.model)) {
      await step.runMutation(internal.agentTaskChatWorkflow.ensurePendingTurn, {
        taskId: args.taskId,
        prompt: data.prompt,
        attachmentStorageIds: data.attachmentStorageIds,
        model: args.model,
      });

      await step.runAction(internal.sandbox.prewarmEntityDaemon, {
        sandboxId: activeSandboxId,
        repoId: data.repoId,
        userId: args.userId,
        entityId: String(args.taskId),
        streamingEntityId,
        entityIdField: "taskId",
        completionMutation: "agentTaskChatWorkflow:handleCompletion",
        ...TASK_CHAT_DAEMON_MUTATIONS,
        model: data.model,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
        allowedTools: CHAT_ALLOWED_TOOLS,
        providerAccountId: args.providerAccountId,
        credentialOwnerUserId: args.credentialOwnerUserId,
        sessionPersistenceId: args.taskId,
        activeWorkflowField: "activeChatWorkflowId",
        skipPrewarm: false,
        entityTable: "agentTasks",
      });
    } else {
      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId: activeSandboxId,
        entityId: args.taskId,
        prompt: data.prompt,
        userId: args.userId,
        completionMutation: "agentTaskChatWorkflow:handleCompletion",
        entityIdField: "taskId",
        model: data.model,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
        providerAccountId: args.providerAccountId,
        credentialOwnerUserId: args.credentialOwnerUserId,
        allowedTools: CHAT_ALLOWED_TOOLS,
        repoId: data.repoId,
        sessionPersistenceId: args.taskId,
        streamingEntityId,
        attachmentStorageIds: data.attachmentStorageIds,
      });
    }

    const result = await step.awaitEvent(agentTaskChatCompleteEvent);

    // Persist the assistant reply BEFORE publish. A hung/slow git push used to
    // leave the UI on "Working…" and, when it failed, replace the answer with
    // merge-conflict output the sandbox did not have (task 231). Publish
    // failures become their own alert below.
    await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
      taskId: args.taskId,
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
          `[agentTaskChatWorkflow] pushSandboxBranch failed taskId=${String(args.taskId)}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
          taskId: args.taskId,
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

/** Inserts an empty assistant message into the task chat for streaming updates. */
export const addAssistantPlaceholder = internalMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    await insertAssistantPlaceholderIfNeeded(ctx, {
      parentId: args.taskId,
      recentLimit: 5,
      skipSystemAlerts: false,
    });
    return null;
  },
});

/**
 * Flips a closed preview sandbox to `starting` so `taskSandboxReady` will
 * accept the subsequent start. Without this, ready is ignored on `closed`
 * and the chat stays on "Resuming sandbox…".
 */
export const markTaskSandboxStartingForChat = internalMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (task.reviewTaskSandboxStatus === "active") return null;
    if (task.reviewTaskSandboxStatus === "starting") return null;
    await ctx.db.patch(args.taskId, {
      reviewTaskSandboxStatus: "starting",
      updatedAt: Date.now(),
    });
    await seedSandboxStartupActivity(
      ctx.db,
      `task-sandbox-startup-${args.taskId}`,
    );
    return null;
  },
});

/** Fetches task + repo data and builds the chat prompt. */
export const getChatData = internalQuery({
  args: {
    taskId: v.id("agentTasks"),
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
    baseBranch: v.string(),
    prompt: v.string(),
    model: aiModelValidator,
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!task.repoId) throw new Error("Task is not associated with a repo");

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

    const { prompt, attachmentStorageIds } = await buildTaskChatTurnPrompt(
      ctx,
      {
        taskId: args.taskId,
        message: args.message,
        model: args.model,
        userId: args.userId,
      },
    );

    const branchName = await resolveTaskBranchName(ctx.db, task);
    const baseBranch = await resolveTaskWorkflowBaseBranchForTask(
      ctx.db,
      task,
      repo,
    );

    return {
      sandboxId: task.sandboxId,
      sandboxStatus: task.reviewTaskSandboxStatus,
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: task.repoId,
      installationId: repo.installationId,
      branchName,
      baseBranch,
      prompt,
      model: normalizeAIModel(args.model),
      attachmentStorageIds,
    };
  },
});

/** Saves the chat result, finalising the last assistant message and starting the next queued message. */
export const saveResult = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
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
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const outcome = await applyChatTurnResult(ctx, {
      parentId: args.taskId,
      streamingEntityId: chatStreamEntityId(args.taskId),
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
      alertTitle: "Failed to publish task branch",
      pendingQuestion: args.pendingQuestion,
      model: args.model,
    });
    if (outcome === "publish-failure") return null;

    await ctx.db.patch(args.taskId, {
      activeChatWorkflowId: undefined,
      // The turn is over, so the claim stamp has nothing left to vouch for.
      // See `_chat/pendingTurnRestage.ts`.
      pendingTurnClaimedAt: undefined,
      updatedAt: Date.now(),
    });

    await startNextQueuedTaskChatMessage(ctx, args.taskId);
    return null;
  },
});

/** Receives sandbox completion callback and forwards the event to the active chat workflow. */
export const handleCompletion = authMutation({
  args: {
    taskId: v.id("agentTasks"),
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
    const task = await ctx.db.get(args.taskId);
    if (!task || !task.activeChatWorkflowId) return null;
    if (!task.repoId) return null;
    if (!(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    if (
      task.pendingTurn !== undefined ||
      task.pendingTurnClaimedAt !== undefined
    ) {
      await ctx.db.patch(args.taskId, {
        pendingTurn: undefined,
        pendingTurnClaimedAt: undefined,
      });
    }

    await sendCompletionEvent(
      ctx,
      agentTaskChatCompleteEvent,
      task.activeChatWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
        pendingQuestion: args.pendingQuestion,
      },
    );

    await recordCompletionLog(ctx, {
      entityType: "task-chat",
      entityId: String(args.taskId),
      entityTitle: task.title,
      repoId: task.repoId,
      rawResultEvent: args.rawResultEvent,
      projectId: task.projectId,
    });

    return null;
  },
});

/** Fired when the task sandbox chat view opens to warm the chat daemon. */
export const prewarmChatDaemon = authMutation({
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task?.sandboxId || !task.repoId) return null;
    // Never prewarm a stopped/stopping sandbox. prewarmEntityDaemon execs on
    // the sandbox, and on Vercel any exec lazily resumes a stopped VM —
    // resurrecting a sandbox the user stopped, invisibly (same guard as
    // sessions' prewarmDaemon).
    if (
      task.reviewTaskSandboxStatus === "closed" ||
      task.reviewTaskSandboxStatus === "stopping"
    ) {
      return null;
    }
    if (!(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const normalizedModel = normalizeAIModel(task.lastChatModel ?? task.model);
    await ctx.scheduler.runAfter(0, internal.sandbox.prewarmEntityDaemon, {
      sandboxId: task.sandboxId,
      repoId: task.repoId,
      userId: ctx.userId,
      entityId: String(args.taskId),
      streamingEntityId: chatStreamEntityId(args.taskId),
      entityIdField: "taskId",
      completionMutation: "agentTaskChatWorkflow:handleCompletion",
      ...TASK_CHAT_DAEMON_MUTATIONS,
      model: normalizedModel,
      // Forward the sticky traits normalised through the same helper as the
      // composer so the prewarm's opts sig matches the turn path. The send path
      // omits defaults, so passing the stored values verbatim (e.g. reasoning
      // "high", the Claude default, or `fastMode: false` on a model with no Fast
      // trait) mismatches a trait-launched daemon and kill+respawns it on every
      // page open (see sessions' prewarmDaemon).
      ...launchTraitsFromStored(normalizedModel, {
        reasoningLevel: task.lastReasoningLevel,
        thinkingEnabled: task.lastThinkingEnabled,
        use1mContext: task.lastUse1mContext,
        fastMode: task.lastFastMode,
      }),
      allowedTools: CHAT_ALLOWED_TOOLS,
      providerAccountId: task.providerAccountId,
      credentialOwnerUserId: task.createdBy,
      sessionPersistenceId: args.taskId,
      activeWorkflowField: "activeChatWorkflowId",
      skipPrewarm: false,
      entityTable: "agentTasks",
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
  args: { taskId: v.id("agentTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.agentTaskChatWorkflow.getChatPrewarmData,
      { taskId: args.taskId, userId: ctx.userId },
    );
    if (!data) return null;
    await ctx.runAction(internal.sandbox.prewarmEntityDaemon, {
      sandboxId: data.sandboxId,
      repoId: data.repoId,
      userId: data.ownerUserId,
      entityId: String(args.taskId),
      streamingEntityId: chatStreamEntityId(args.taskId),
      entityIdField: "taskId",
      completionMutation: "agentTaskChatWorkflow:handleCompletion",
      ...TASK_CHAT_DAEMON_MUTATIONS,
      model: data.model,
      reasoningLevel: data.reasoningLevel,
      thinkingEnabled: data.thinkingEnabled,
      use1mContext: data.use1mContext,
      fastMode: data.fastMode,
      allowedTools: CHAT_ALLOWED_TOOLS,
      providerAccountId: data.providerAccountId,
      credentialOwnerUserId: data.ownerUserId,
      sessionPersistenceId: args.taskId,
      activeWorkflowField: "activeChatWorkflowId",
      skipPrewarm: false,
      entityTable: "agentTasks",
    });
    return null;
  },
});

export const getChatPrewarmData = internalQuery({
  args: {
    taskId: v.id("agentTasks"),
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
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (
      !task.repoId ||
      !(await hasRepoAccess(ctx.db, task.repoId, args.userId))
    ) {
      throw new Error("Not authorized");
    }
    if (
      !task.sandboxId ||
      task.reviewTaskSandboxStatus === "closed" ||
      task.reviewTaskSandboxStatus === "stopping"
    ) {
      return null;
    }
    const normalizedModel = normalizeAIModel(task.lastChatModel ?? task.model);
    return {
      sandboxId: task.sandboxId,
      repoId: task.repoId,
      ownerUserId: task.createdBy,
      model: normalizedModel,
      // Normalised here, not in the caller: the traits must be exactly what the
      // composer sends (defaults omitted) or the prewarm's opts sig differs from
      // the turn path's and kills the warm daemon.
      ...launchTraitsFromStored(normalizedModel, {
        reasoningLevel: task.lastReasoningLevel,
        thinkingEnabled: task.lastThinkingEnabled,
        use1mContext: task.lastUse1mContext,
        fastMode: task.lastFastMode,
      }),
      providerAccountId: task.providerAccountId,
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
} from "./_chat/taskChatDaemon";
