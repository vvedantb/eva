import { drainSteers, steerClaimArgs } from "../_chat/steerClaim";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { toWorkflowId, workflow } from "../workflowManager";
import { ensureSandboxStartedSteps } from "../_sandbox_runtime/resumeSandboxSteps";
import {
  prepareLinkedRepoSteps,
  publishLinkedRepoSteps,
} from "./linkedRepoSteps";
import { authMutation, hasRepoAccess } from "../functions";
import {
  aiModelValidator,
  DEFAULT_AI_MODEL,
  reasoningLevelValidator,
  workflowCompleteValidator,
  normalizeAIModel,
  sessionStatusValidator,
  turnCheckpointArgs,
  turnLeaseFenceArgs,
  usesChatDaemon,
  daemonClaimResultValidator,
} from "../validators";
import { resolveSessionBaseBranch } from "./baseBranch";
import { parseFirstJsonValue } from "../_shared/llmJson";
import { recordCompletionLog } from "../_agentJobs/completion";
import {
  drainSessionChatQueues,
  scheduleQueueDrainAfterBackgroundAgents,
} from "../_queues/helpers";
import { z } from "zod";
import { formatDelayedPublishFailureError } from "./resultTarget";
import {
  applyChatTurnResult,
  insertAssistantPlaceholderIfNeeded,
  syntheticTurnCompletionPatch,
  turnCheckpointPatch,
  type AssistantTurnResultPatch,
} from "../_chat/chatResult";
import { resolveStorageUrls } from "../_chat/storageUrls";
import { buildSessionPrompt, SESSION_TOOLS } from "./sessionPrompt";
import { buildSessionBranchName } from "../_git/branchNames";
import { scheduleScopeCheck } from "../_scopeCheck/mutations";
import {
  isPendingTurnLive,
  isTurnClaimed,
  isUnclaimedOpenTurn,
} from "./pendingTurnRecovery";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { notifyThreadAnswer } from "../_mentions/notifyChatMentions";
import {
  clearStreamingActivity,
  finalizeCancelledAssistantMessage,
} from "../streaming";
import { backgroundAgentEntryValidator } from "../_validators/tableFields";
import { mergeBackgroundAgents } from "./backgroundAgents";
import { agentGoalArg, agentGoalPatch } from "../_chat/agentGoal";
import { isDaemonClaimPaused } from "../_chat/daemonClaimPause";
import { isStreamingActivityStale } from "../_chat/turnLease";
import { findPrimaryPullRequest } from "../_pullRequests/store";
import {
  advanceTurn,
  claimStagedTurn,
  closeTurn,
  findOpenTurn,
  isSupersededChatResult,
  leaseSyntheticTurn,
  openSessionChatTurn,
  resolveCompletionTurn,
} from "../_chat/turnStore";
import { openTurnWorkflowId } from "../_chat/turnProjection";
import {
  daemonChatTargetArgs,
  ensureMainChat,
  getSessionChatOrThrow,
  loadSessionChat,
  resolveDaemonChatId,
  sessionChatPersistenceId,
  sessionChatPersistenceIdValidator,
  sessionChatStreamingEntityId,
} from "../_sessionChats/helpers";
import { errorMessage } from "@vvedantb/server";
import { insertTurnFollowUp } from "../_messages/replies";
import { isStandaloneSession, sessionOwnerTaskId } from "./owner";

export const sessionCompleteEvent = defineEvent({
  name: "sessionComplete",
  validator: workflowCompleteValidator,
});

const designResultSchema = z.object({
  summary: z.string().optional(),
  variations: z
    .array(
      z.object({
        label: z.string(),
        route: z.string().optional(),
        filePath: z.string().optional(),
      }),
    )
    .min(1),
});

function parseDesignResult(
  text: string | null,
): z.infer<typeof designResultSchema> | null {
  if (!text) return null;
  return parseFirstJsonValue(text, designResultSchema) ?? null;
}

async function finalizeOpenSyntheticTurn(
  ctx: MutationCtx,
  chatId: Id<"sessionChats">,
  syntheticTurnMessageId: Id<"messages"> | undefined,
): Promise<void> {
  if (syntheticTurnMessageId === undefined) return;
  const syntheticMessage = await ctx.db.get(syntheticTurnMessageId);
  if (syntheticMessage && syntheticMessage.finishedAt === undefined) {
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) =>
        q.eq("entityId", sessionChatStreamingEntityId(chatId)),
      )
      .first();
    await finalizeCancelledAssistantMessage(ctx, syntheticMessage, streaming);
  }
  await ctx.db.patch(chatId, { syntheticTurnMessageId: undefined });
}

/** Starts a session sandbox (clone + branch setup) as a durable workflow step. */
export const sessionSandboxStartupWorkflow = workflow.define({
  args: {
    sessionId: v.id("sessions"),
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
    hasLinkedRepos: v.optional(v.boolean()),
    startAttempt: v.optional(v.number()),
  },
  handler: async (step, args): Promise<void> => {
    await step.runAction(internal.sandbox.startSessionSandbox, {
      sessionId: args.sessionId,
      existingSandboxId: args.existingSandboxId,
      installationId: args.installationId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      branchName: args.branchName,
      baseBranch: args.baseBranch,
      repoId: args.repoId,
      startAttempt: args.startAttempt,
      hasLinkedRepos: args.hasLinkedRepos,
    });

    if (args.hasLinkedRepos !== true) return;

    const session = await step.runQuery(internal.sessions.getInternal, {
      id: args.sessionId,
    });
    if (!session?.sandboxId) {
      return;
    }
    const sandboxId = session.sandboxId;

    await prepareLinkedRepoSteps(step, {
      sessionId: args.sessionId,
      sandboxId,
      repoId: args.repoId,
    });

    await step.runMutation(internal.sessions.clearSandboxSetupPending, {
      sessionId: args.sessionId,
    });
  },
});

/** Runs one chat's message through the sandbox agent. */
export const sessionExecuteWorkflow = workflow.define({
  args: {
    chatId: v.id("sessionChats"),
    message: v.string(),
    model: aiModelValidator,
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    credentialOwnerUserId: v.optional(v.id("users")),
    userId: v.id("users"),
    installationId: v.number(),
    turnId: v.id("turns"),
  },
  handler: async (step, args): Promise<void> => {
    await step.runMutation(internal.sessionWorkflow.addAssistantPlaceholder, {
      chatId: args.chatId,
    });

    const data = await step.runQuery(internal.sessionWorkflow.getSessionData, {
      chatId: args.chatId,
      message: args.message,
      model: args.model,
      userId: args.userId,
    });
    const sessionId = data.sessionId;

    let sandboxId: string | null = null;
    let validatedSandboxId: string | null = null;

    if (data.sandboxId) {
      let started: Awaited<ReturnType<typeof ensureSandboxStartedSteps>>;
      try {
        started = await ensureSandboxStartedSteps(step, {
          sandboxId: data.sandboxId,
          repoId: data.repoId,
          streamingEntityId: args.chatId,
          sandboxRunning: data.status === "active",
        });
      } catch (error) {
        await step.runMutation(internal.sessionWorkflow.saveResult, {
          chatId: args.chatId,
          turnId: args.turnId,
          success: false,
          result: null,
          error:
            error instanceof Error
              ? error.message
              : "Sandbox could not be restored from cold storage. Please retry.",
          activityLog: null,
        });
        return;
      }

      const thawId = started.thawId;
      if (thawId) {
        const validation = await step.runAction(
          internal.sandbox.validateSandbox,
          {
            sandboxId: thawId,
            repoId: data.repoId,
            skipDocker: data.sandboxSetupPending,
          },
          { retry: false },
        );
        validatedSandboxId = validation.healthy ? thawId : null;
      }
    }

    if (validatedSandboxId) {
      sandboxId = validatedSandboxId;
    } else {
      const prepared = await step.runAction(
        internal.sandbox.prepareSessionSandbox,
        {
          sessionId,
          existingSandboxId: data.sandboxId,
          installationId: args.installationId,
          repoOwner: data.repoOwner,
          repoName: data.repoName,
          branchName: data.branchName ?? buildSessionBranchName(sessionId),
          baseBranch: data.baseBranch,
          repoId: data.repoId,
          startDesktop: false,
        },
        { retry: { maxAttempts: 2, initialBackoffMs: 2000, base: 2 } },
      );
      sandboxId = prepared.sandboxId;

      await step.runMutation(internal.sessionWorkflow.updateSandboxId, {
        sessionId,
        sandboxId,
        branchName: data.branchName,
      });
      if ((data.linkedRepoCount ?? 0) > 0) {
        await prepareLinkedRepoSteps(step, {
          sessionId,
          sandboxId,
          repoId: data.repoId,
        });
      }
    }

    if (sandboxId === null) {
      throw new Error("sessionExecuteWorkflow: sandbox was not resolved");
    }

    await step.runMutation(internal.turns.markLaunching, {
      turnId: args.turnId,
      sandboxId,
    });
    await step.runAction(internal.sandbox.applyBranchPublishPolicy, {
      sandboxId,
      repoId: data.repoId,
      userId: args.userId,
      branchName: data.branchName ?? buildSessionBranchName(sessionId),
    });
    await step.runMutation(internal.sessionWorkflow.clearSessionClosedStatus, {
      sessionId,
    });

    if (usesChatDaemon(data.model)) {
      await step.runMutation(internal.sessionWorkflow.ensurePendingTurn, {
        chatId: args.chatId,
        prompt: data.prompt,
        attachmentStorageIds: data.attachmentStorageIds,
        model: args.model,
      });
    }

    if (usesChatDaemon(data.model)) {
      await step.runAction(internal.sandbox.prewarmSessionDaemon, {
        sandboxId,
        chatId: args.chatId,
        repoId: data.repoId,
        userId: args.userId,
        model: data.model,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
        allowedTools: SESSION_TOOLS,
        providerAccountId: args.providerAccountId,
        credentialOwnerUserId: args.credentialOwnerUserId,
        sessionPersistenceId: data.sessionPersistenceId,
      });
    } else {
      try {
        if (data.sandboxSetupPending) {
          await step.runAction(internal.sessionWorkflow.waitForSessionSetup, {
            sessionId,
          });
        }
        const turnLease = await step.runMutation(
          internal.turns.acquireOneShotLease,
          { turnId: args.turnId, sandboxId },
        );
        if (turnLease === null) {
          await step.runMutation(internal.sessionWorkflow.saveResult, {
            chatId: args.chatId,
            turnId: args.turnId,
            success: false,
            result: null,
            error: "The turn no longer owns this chat. Please retry.",
            activityLog: null,
          });
          return;
        }
        await step.runAction(internal.sandbox.launchOnExistingSandbox, {
          sandboxId,
          entityId: String(args.chatId),
          prompt: data.prompt,
          userId: args.userId,
          completionMutation: "sessionWorkflow:handleCompletion",
          entityIdField: "chatId",
          model: data.model,
          reasoningLevel: args.reasoningLevel,
          thinkingEnabled: args.thinkingEnabled,
          use1mContext: args.use1mContext,
          fastMode: args.fastMode,
          allowedTools: SESSION_TOOLS,
          repoId: data.repoId,
          streamingEntityId: String(args.chatId),
          sessionPersistenceId: data.sessionPersistenceId,
          providerAccountId: args.providerAccountId,
          credentialOwnerUserId: args.credentialOwnerUserId,
          attachmentStorageIds: data.attachmentStorageIds,
          turnId: turnLease.turnId,
          turnLeaseGeneration: turnLease.leaseGeneration,
        });
      } catch (error) {
        await step.runMutation(internal.sessionWorkflow.saveResult, {
          chatId: args.chatId,
          turnId: args.turnId,
          success: false,
          result: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to launch the agent on the sandbox. Please retry.",
          activityLog: null,
        });
        return;
      }
    }

    const result = await step.awaitEvent(sessionCompleteEvent);

    await step.runMutation(internal.sessionWorkflow.saveResult, {
      chatId: args.chatId,
      turnId: args.turnId,
      success: result.success,
      result: result.result,
      error: result.error,
      activityLog: result.activityLog,
      model: args.model,
      pendingQuestion: result.pendingQuestion,
      beforeSha: result.beforeSha,
      afterSha: result.afterSha,
      beforeShas: result.beforeShas,
      afterShas: result.afterShas,
    });

    let pushSucceeded = false;
    let pushedCommits = false;
    let branchPublished = false;
    if (result.success && data.branchName) {
      try {
        const pushResult = await step.runAction(
          internal.sandbox.pushSandboxBranch,
          {
            sandboxId,
            installationId: args.installationId,
            repoOwner: data.repoOwner,
            repoName: data.repoName,
            repoId: data.repoId,
            branchName: data.branchName,
          },
        );
        pushSucceeded = true;
        pushedCommits = pushResult.pushed;
        branchPublished = pushResult.published;
      } catch (error) {
        const publishError = formatDelayedPublishFailureError("session", error);
        console.error(
          `[sessionWorkflow] pushSandboxBranch failed chatId=${args.chatId}: ${errorMessage(error)}`,
        );
        await step.runMutation(internal.sessionWorkflow.saveResult, {
          chatId: args.chatId,
          turnId: args.turnId,
          success: false,
          result: result.result,
          error: publishError,
          activityLog: result.activityLog,
          pendingQuestion: result.pendingQuestion,
        });
      }
    }

    if (pushSucceeded) {
      await step.runMutation(
        internal.sessionWorkflow.scheduleSessionDeploymentTracking,
        {
          sessionId,
          installationId: args.installationId,
          repoOwner: data.repoOwner,
          repoName: data.repoName,
          repoId: data.repoId,
          branchName: data.branchName,
          deploymentProjectName: data.deploymentProjectName,
        },
      );

      const turnCommitted =
        result.afterSha !== undefined && result.afterSha !== result.beforeSha;
      if (
        data.ownerTaskId !== undefined &&
        (pushedCommits || (branchPublished && turnCommitted))
      ) {
        try {
          await step.runAction(internal.taskWorkflowActions.ensureTaskChatPr, {
            taskId: data.ownerTaskId,
          });
        } catch (error) {
          const errorDetail = errorMessage(error);
          console.error(
            `[sessionWorkflow] ensureTaskChatPr failed taskId=${data.ownerTaskId}: ${errorDetail}`,
          );
          await step.runMutation(internal.sessionWorkflow.postSystemAlert, {
            chatId: args.chatId,
            content: "Failed to create task PR",
            errorDetail,
          });
        }
      }
      if (
        data.ownsPullRequests !== false &&
        (pushedCommits || (branchPublished && data.primaryPrUrl === undefined))
      ) {
        try {
          await step.runAction(internal.github.createDraftSessionPr, {
            sessionId,
          });
        } catch (error) {
          const errorDetail =
            errorMessage(error);
          console.error(
            `[sessionWorkflow] createDraftSessionPr failed sessionId=${sessionId}: ${errorDetail}`,
          );
          await step.runMutation(internal.sessionWorkflow.postSystemAlert, {
            chatId: args.chatId,
            content: "Failed to create draft PR",
            errorDetail,
          });
        }
      }
    }

    if (
      result.success &&
      (data.ownsPullRequests !== false || data.ownerTaskId !== undefined) &&
      (data.linkedRepoCount ?? 0) > 0
    ) {
      await publishLinkedRepoSteps(step, {
        sessionId,
        sandboxId,
        repoId: data.repoId,
        alert: { chatId: args.chatId },
      });
    }
  },
});

/** Queues deployment status polling for a session branch after a successful execute. */
export const scheduleSessionDeploymentTracking = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    branchName: v.string(),
    deploymentProjectName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { deploymentStatus: "queued" });
    await ctx.scheduler.runAfter(
      30_000,
      internal.taskWorkflowActions.pollSessionDeploymentStatus,
      {
        sessionId: args.sessionId,
        installationId: args.installationId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        repoId: args.repoId,
        branchName: args.branchName,
        deploymentProjectName: args.deploymentProjectName,
        attempt: 0,
      },
    );
    return null;
  },
});

/**
 * Posts a non-streaming system alert into a chat (e.g. draft PR failure).
 * Session-level callers (PR webhooks, linked-repo setup) pass `sessionId` and
 * the alert lands in Main; turn-level callers pass the chat the turn ran in.
 */
export const postSystemAlert = internalMutation({
  args: {
    chatId: v.optional(v.id("sessionChats")),
    sessionId: v.optional(v.id("sessions")),
    content: v.string(),
    errorDetail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let chatId = args.chatId;
    if (chatId === undefined) {
      if (args.sessionId === undefined) {
        throw new Error("postSystemAlert needs a chatId or a sessionId");
      }
      const session = await ctx.db.get(args.sessionId);
      if (!session) return null;
      chatId = (await ensureMainChat(ctx, session))._id;
    }
    const context = await loadSessionChat(ctx.db, chatId);
    if (!context) return null;
    const alert = {
      content: args.content,
      timestamp: Date.now(),
      isSystemAlert: true,
      ...(args.errorDetail !== undefined && { errorDetail: args.errorDetail }),
    };
    if (args.chatId === undefined) {
      await ctx.db.insert("messages", { parentId: chatId, role: "assistant", ...alert });
    } else {
      await insertTurnFollowUp(ctx, { parentId: chatId, role: "assistant", ...alert });
    }
    await ctx.db.patch(chatId, { updatedAt: Date.now() });
    await ctx.db.patch(context.session._id, { updatedAt: Date.now() });
    return null;
  },
});

/** Clears stuck empty Working bubbles + leftover streaming for a chat. */
export const clearStuckWorkingState = internalMutation({
  args: { chatId: v.id("sessionChats") },
  returns: v.object({
    deletedPlaceholders: v.number(),
    clearedStreaming: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.chatId))
      .collect();
    let deletedPlaceholders = 0;
    for (const message of messages) {
      if (
        message.role === "assistant" &&
        message.isSystemAlert !== true &&
        message.content === "" &&
        message.finishedAt === undefined
      ) {
        await ctx.db.delete(message._id);
        deletedPlaceholders += 1;
      }
    }
    const chat = await ctx.db.get(args.chatId);
    if (chat?.syntheticTurnMessageId) {
      await finalizeOpenSyntheticTurn(
        ctx,
        args.chatId,
        chat.syntheticTurnMessageId,
      );
    }
    await clearStreamingActivity(ctx, sessionChatStreamingEntityId(args.chatId));
    await ctx.db.patch(args.chatId, {
      pendingTurn: undefined,
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    const turn = await findOpenTurn(ctx, args.chatId);
    if (turn) {
      await closeTurn(ctx, turn, "error", {
        error: "Turn state was cleared during recovery",
      });
    }
    return { deletedPlaceholders, clearedStreaming: true };
  },
});

/**
 * Inserts an empty assistant message into the session for streaming updates.
 * Idempotent: the daemon-pull staging already inserts this placeholder
 * before starting the workflow, so if the last message is already an empty
 * assistant placeholder we skip, avoiding a duplicate.
 */
export const addAssistantPlaceholder = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");

    await insertAssistantPlaceholderIfNeeded(ctx, {
      parentId: args.chatId,
      recentLimit: 10,
      skipSystemAlerts: true,
    });
    return null;
  },
});

/** Fetches session and repo data, builds the turn prompt, and resolves branch config. */
export const getSessionData = internalQuery({
  args: {
    chatId: v.id("sessionChats"),
    message: v.string(),
    model: aiModelValidator,
    userId: v.id("users"),
  },
  returns: v.object({
    sessionId: v.id("sessions"),
    sessionPersistenceId: sessionChatPersistenceIdValidator,
    sandboxId: v.optional(v.string()),
    status: sessionStatusValidator,
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    prompt: v.string(),
    branchName: v.optional(v.string()),
    primaryPrUrl: v.optional(v.string()),
    baseBranch: v.string(),
    model: aiModelValidator,
    deploymentProjectName: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    linkedRepoCount: v.optional(v.number()),
    sandboxSetupPending: v.boolean(),
    ownsPullRequests: v.optional(v.boolean()),
    ownerTaskId: v.optional(v.id("agentTasks")),
  }),
  handler: async (ctx, args) => {
    const [{ chat, session }, user, triggeringUserMessage] = await Promise.all([
      getSessionChatOrThrow(ctx.db, args.chatId),
      ctx.db.get(args.userId),
      ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", args.chatId))
        .order("desc")
        .filter((q) => q.eq(q.field("role"), "user"))
        .first(),
    ]);

    const [repo, primaryPr] = await Promise.all([
      ctx.db.get(session.repoId),
      findPrimaryPullRequest(ctx.db, {
        kind: "session",
        sessionId: session._id,
      }),
    ]);
    if (!repo) throw new Error("Repository not found");

    const { prompt, branchName } = await buildSessionPrompt(ctx, {
      session,
      chat,
      repo,
      user,
      message: args.message,
      model: args.model,
    });

    return {
      sessionId: session._id,
      sessionPersistenceId: sessionChatPersistenceId(chat),
      sandboxId: session.sandboxId,
      status: session.status,
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: session.repoId,
      prompt,
      branchName,
      primaryPrUrl: primaryPr?.prUrl,
      baseBranch: resolveSessionBaseBranch(session, repo),
      model: normalizeAIModel(args.model),
      deploymentProjectName: repo.deploymentProjectName,
      attachmentStorageIds: triggeringUserMessage?.attachmentStorageIds,
      linkedRepoCount: session.linkedRepoCount,
      sandboxSetupPending: session.sandboxSetupPending === true,
      ownsPullRequests: isStandaloneSession(session),
      ownerTaskId: sessionOwnerTaskId(session),
    };
  },
});

/** Updates the session's sandbox ID and optionally its branch name after sandbox preparation. */
export const updateSandboxId = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    sandboxId: v.string(),
    branchName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: {
      sandboxId: string;
      branchName?: string;
      updatedAt: number;
    } = {
      sandboxId: args.sandboxId,
      updatedAt: Date.now(),
    };
    if (args.branchName) {
      updates.branchName = args.branchName;
    }
    await ctx.db.patch(args.sessionId, updates);
    return null;
  },
});

/**
 * Drops a session's stale `closed` status once this turn has a sandbox that
 * validated as running.
 *
 * `prepareSessionSandbox` flips the status back to "active" whenever it starts
 * or replaces a VM, but the reuse branch above never calls it — a healthy
 * sandbox needs no preparing — so the status stayed at whatever the last stop
 * left. `prewarmSessionDaemon` then refuses to start the agent daemon on a
 * closing session (`isSandboxClosingStatus`, `_sandbox_runtime/execution.ts`),
 * returning in ~60ms without launching anything: the turn opens, no daemon ever
 * calls `claimPendingTurn`, its lease is never acquired, and the watchdog
 * stalls it out 15 minutes later. That is how Manager Ave (session 111) went
 * silent — every agent-notification wake-up revalidated the same healthy
 * sandbox, skipped prewarm, and posted "Turn stalled".
 *
 * Only "closed" is cleared, never "stopping": a stop that is genuinely in
 * flight must win over a turn that raced it, and the stop path flips the status
 * itself when it settles.
 *
 * This does not weaken the `prewarmNeverResurrects` contract. It runs only
 * after the workflow validated the VM as running, and the page-open guard in
 * `prewarmDaemon` is untouched, so opening a stopped session's page still
 * cannot wake its sandbox.
 */
export const clearSessionClosedStatus = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "closed") return null;
    await ctx.db.patch(args.sessionId, {
      status: "active",
      sandboxError: undefined,
      updatedAt: Date.now(),
    });
    console.log(
      `[sessionWorkflow] clearSessionClosedStatus sessionId=${args.sessionId}`,
    );
    return null;
  },
});

async function notifyAnswerInThread(
  ctx: MutationCtx,
  turn: Doc<"turns">,
  success: boolean,
  context: { session: Doc<"sessions">; chat: Doc<"sessionChats"> },
): Promise<void> {
  if (!success || turn.replyTo === undefined || turn.askedBy === undefined) {
    return;
  }
  const answer =
    turn.placeholderMessageId === undefined
      ? null
      : await ctx.db.get(turn.placeholderMessageId);
  await notifyThreadAnswer(ctx, {
    askerId: turn.askedBy,
    rootId: turn.replyTo,
    content: answer?.content ?? "",
    surface: { kind: "session", ...context },
  });
}

/** Saves a chat turn's result, updating the last message and starting queued messages. */
export const saveResult = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    turnId: v.id("turns"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    model: v.optional(aiModelValidator),
    planContent: v.optional(v.string()),
    pendingQuestion: v.optional(v.string()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadSessionChat(ctx.db, args.chatId);
    if (!context) return null;
    const { chat, session } = context;
    const turn = await ctx.db.get(args.turnId);
    if (
      isSupersededChatResult(turn, await openTurnWorkflowId(ctx, chat._id))
    ) {
      return null;
    }

    const designParsed = args.success ? parseDesignResult(args.result) : null;
    const extraPatch: Omit<AssistantTurnResultPatch, "content"> = {
      isSystemAlert: undefined,
      errorDetail: undefined,
      ...(designParsed
        ? {
            variations: designParsed.variations.map((variation) => ({
              label: variation.label,
              route: variation.route,
              filePath: variation.filePath,
            })),
          }
        : {}),
      ...turnCheckpointPatch(args),
    };

    const outcome = await applyChatTurnResult(ctx, {
      parentId: chat._id,
      streamingEntityId: sessionChatStreamingEntityId(chat._id),
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
      alertTitle: "Failed to publish session branch",
      pendingQuestion: args.pendingQuestion,
      model: args.model,
      content:
        designParsed !== null
          ? designParsed.summary || "Here are the design variations:"
          : undefined,
      extraPatch,
    });
    if (outcome === "publish-failure" || outcome === "no-target") return null;

    const now = Date.now();
    await ctx.db.patch(chat._id, { updatedAt: now });
    const sessionPatch: {
      updatedAt: number;
      planContent?: string;
      agentBrowsingAt?: undefined;
    } = {
      updatedAt: now,
      agentBrowsingAt: undefined,
    };
    if (args.planContent && args.planContent !== session.planContent) {
      sessionPatch.planContent = args.planContent;
    }
    await ctx.db.patch(session._id, sessionPatch);
    if (turn) {
      await closeTurn(
        ctx,
        turn,
        args.success ? "done" : "error",
        args.error ? { error: args.error } : {},
      );
      await notifyAnswerInThread(ctx, turn, args.success, { session, chat });
    }
    await drainSessionChatQueues(ctx, session._id, chat._id);
    return null;
  },
});

/**
 * Daemon-pull turn claim. The warm sandbox daemon polls this every ~50ms; when
 * a send has staged a prompt in `chat.pendingTurn`, this atomically
 * hands it over and clears the field so the same prompt is never claimed twice
 * (which would double-execute the turn). Returns `{ prompt: null }` when nothing
 * is pending. Also doubles as the interrupt-cancel channel: `cancelRequested`
 * drains unconditionally (even mid-turn, with no pendingTurn) so a Claude
 * daemon polling during an active turn learns to abort it. Public + auth-gated
 * (via the sandbox CONVEX_TOKEN identity) to match `handleCompletion` — the
 * daemon calls it over `/api/mutation`, and internal mutations are not
 * reachable there.
 *
 * The chat row is small (no plan, terminal tail or panes), so the poll reads
 * it directly; the session is only read once a turn is actually pending, for
 * the setup gate.
 */
export const claimPendingTurn = authMutation({
  args: {
    ...daemonChatTargetArgs,
    model: v.optional(aiModelValidator),
    acceptTurn: v.optional(v.boolean()),
    ...steerClaimArgs,
  },
  returns: daemonClaimResultValidator,
  handler: async (ctx, args) => {
    const emptyClaim = {
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
    const chatId = await resolveDaemonChatId(ctx.db, args);
    if (chatId === null) return emptyClaim;
    const chat = await ctx.db.get(chatId);
    if (!chat) return emptyClaim;
    if (chat.userId !== ctx.userId) {
      if (!(await hasRepoAccess(ctx.db, chat.repoId, ctx.userId)))
        throw new Error("Not authorized");
    }

    const usageRefreshRequested = chat.usageRefreshRequestedAt !== undefined;

    const stopTaskToolUseIds = chat.pendingTaskStops ?? [];
    if (stopTaskToolUseIds.length > 0) {
      await ctx.db.patch(chat._id, { pendingTaskStops: undefined });
    }

    const cancelRequested = chat.cancelRequestedAt !== undefined;
    if (cancelRequested) {
      await ctx.db.patch(chat._id, { cancelRequestedAt: undefined });
    }

    const steers = await drainSteers(ctx, chat, args);

    const drained = {
      ...emptyClaim,
      stopTaskToolUseIds,
      cancelRequested,
      usageRefreshRequested,
      steers,
    };

    if (
      isDaemonClaimPaused({
        claimPausedUntil: chat.claimPausedUntil,
        now: Date.now(),
      })
    ) {
      return drained;
    }

    if (!chat.pendingTurn) return drained;

    const session = await ctx.db.get(chat.sessionId);
    if (session?.sandboxSetupPending === true) return drained;

    if (args.acceptTurn === false) return drained;

    const pendingModel = chat.pendingTurn.model;
    if (pendingModel !== undefined) {
      const claimModel = normalizeAIModel(args.model);
      if (normalizeAIModel(pendingModel) !== claimModel) {
        console.log(
          `[sessionWorkflow] claimPendingTurn model mismatch chatId=${chat._id} pending=${pendingModel} claim=${claimModel}`,
        );
        return drained;
      }
    }

    const prompt = chat.pendingTurn.prompt;
    const claimWaitMs = Date.now() - chat.pendingTurn.requestedAt;
    const attachmentUrls = await resolveStorageUrls(
      (id) => ctx.storage.getUrl(id),
      chat.pendingTurn.attachmentStorageIds,
    );
    const pendingTurnId = chat.pendingTurn.turnId;
    const claim =
      pendingTurnId === undefined
        ? { status: "drop" as const }
        : await claimStagedTurn(ctx, pendingTurnId);
    if (claim.status === "drop") {
      await ctx.db.patch(chat._id, { pendingTurn: undefined });
    }
    if (claim.status !== "leased") return drained;
    const turnLease = claim.lease;
    await ctx.db.patch(chat._id, { pendingTurn: undefined });
    console.log(
      `[sessionWorkflow] claimPendingTurn chatId=${chat._id} claimWaitMs=${claimWaitMs} attachments=${attachmentUrls.length}`,
    );
    const claimedTurn = {
      prompt,
      attachmentUrls,
      stopTaskToolUseIds,
      cancelRequested,
      usageRefreshRequested,
      steers,
      interactionMode: "default" as const,
    };
    const turnLifecycle = "durable" as const;
    return { ...claimedTurn, turnLifecycle, ...turnLease };
  },
});

/** Daemon patches background Agent/Task lifecycle entries (start/settle only). */
export const updateBackgroundAgents = authMutation({
  args: {
    ...daemonChatTargetArgs,
    agents: v.array(backgroundAgentEntryValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chatId = await resolveDaemonChatId(ctx.db, args);
    if (chatId === null) return null;
    const chat = await ctx.db.get(chatId);
    if (!chat) throw new Error("Chat not found");
    if (!(await hasRepoAccess(ctx.db, chat.repoId, ctx.userId)))
      throw new Error("Not authorized");
    if (args.agents.length === 0) return null;

    const backgroundAgents = mergeBackgroundAgents(
      chat.backgroundAgents,
      args.agents,
    );
    await ctx.db.patch(chat._id, {
      backgroundAgents,
      updatedAt: Date.now(),
    });
    await scheduleQueueDrainAfterBackgroundAgents(
      ctx,
      chat._id,
      backgroundAgents,
    );
    return null;
  },
});

/** Daemon mirrors Claude's native `/goal` onto the chat (writes only on change). */
export const updateGoal = authMutation({
  args: { ...daemonChatTargetArgs, goal: agentGoalArg },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chatId = await resolveDaemonChatId(ctx.db, args);
    if (chatId === null) return null;
    const chat = await ctx.db.get(chatId);
    if (!chat) throw new Error("Chat not found");
    if (!(await hasRepoAccess(ctx.db, chat.repoId, ctx.userId)))
      throw new Error("Not authorized");
    const patch = agentGoalPatch(chat.goal, args.goal);
    if (patch) await ctx.db.patch(chat._id, patch);
    return null;
  },
});

/** User-facing stop request for a background agent; drained via claimPendingTurn. */
export const requestStopBackgroundAgent = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    toolUseId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    if (!(await hasRepoAccess(ctx.db, chat.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const pending = chat.pendingTaskStops ?? [];
    if (pending.includes(args.toolUseId)) return null;

    await ctx.db.patch(chat._id, {
      pendingTaskStops: [...pending, args.toolUseId],
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Re-stages `pendingTurn` when a cancel raced with a send staging the turn and wiped the
 * prompt while the workflow is still waiting on sessionComplete. No-op when a
 * turn is already pending or the latest assistant message already finished.
 */
export const ensurePendingTurn = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    prompt: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    model: v.optional(aiModelValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return null;
    if (args.model !== undefined && !usesChatDaemon(args.model)) {
      return null;
    }

    const openTurn = await findOpenTurn(ctx, args.chatId);
    if (!openTurn || isTurnClaimed(openTurn)) return null;
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.chatId))
      .order("desc")
      .first();
    if (
      !isUnclaimedOpenTurn({
        hasPendingTurn: isPendingTurnLive({
          pendingTurn: chat.pendingTurn,
          openTurnId: openTurn._id,
        }),
        lastAssistant: last,
      })
    ) {
      return null;
    }

    const pendingTurn = {
      prompt: args.prompt,
      requestedAt: Date.now(),
      turnId: openTurn._id,
      attachmentStorageIds: args.attachmentStorageIds,
      ...(args.model !== undefined
        ? { model: normalizeAIModel(args.model) }
        : {}),
      interactionMode: "default" as const,
    };
    await ctx.db.patch(args.chatId, {
      pendingTurn,
      updatedAt: Date.now(),
    });
    console.log(
      `[sessionWorkflow] ensurePendingTurn restaged chatId=${args.chatId}`,
    );
    return null;
  },
});

/**
 * Ops/recovery: rebuild and stage pendingTurn for a chat stuck on an open
 * assistant placeholder (daemon polling empty after a cancel race).
 */
export const restageOpenTurn = internalMutation({
  args: { chatId: v.id("sessionChats") },
  returns: v.union(
    v.object({ restaged: v.literal(true) }),
    v.object({ restaged: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const context = await loadSessionChat(ctx.db, args.chatId);
    if (!context) return { restaged: false as const, reason: "chat not found" };
    const { chat, session } = context;
    const openTurn = await findOpenTurn(ctx, args.chatId);
    if (!openTurn) return { restaged: false as const, reason: "no open turn" };
    const pendingTurnLive = isPendingTurnLive({
      pendingTurn: chat.pendingTurn,
      openTurnId: openTurn._id,
    });
    if (pendingTurnLive)
      return { restaged: false as const, reason: "pendingTurn already set" };

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.chatId))
      .order("desc")
      .take(5);
    const lastAssistant = messages.find((m) => m.role === "assistant");
    if (
      lastAssistant === undefined ||
      !isUnclaimedOpenTurn({
        hasPendingTurn: pendingTurnLive,
        lastAssistant,
      }) ||
      lastAssistant.content !== ""
    ) {
      return {
        restaged: false as const,
        reason: "no open empty assistant placeholder",
      };
    }
    const lastUser = messages.find((m) => m.role === "user");
    if (
      !lastUser ||
      typeof lastUser.content !== "string" ||
      !lastUser.content
    ) {
      return {
        restaged: false as const,
        reason: "no user message to restage",
      };
    }

    const repo = await ctx.db.get(session.repoId);
    if (!repo) return { restaged: false as const, reason: "repo not found" };
    if (!usesChatDaemon(chat.lastModel)) {
      return {
        restaged: false as const,
        reason: "not a daemon-pull chat",
      };
    }
    const user = await ctx.db.get(session.userId);
    const { prompt } = await buildSessionPrompt(ctx, {
      session,
      chat,
      repo,
      user,
      message: lastUser.content,
      model: chat.lastModel ?? lastUser.model ?? DEFAULT_AI_MODEL,
    });

    const pendingTurn = {
      prompt,
      requestedAt: Date.now(),
      turnId: openTurn._id,
      attachmentStorageIds: lastUser.attachmentStorageIds,
      ...(chat.lastModel !== undefined ? { model: chat.lastModel } : {}),
      interactionMode: "default" as const,
    };
    await ctx.db.patch(args.chatId, {
      pendingTurn,
      updatedAt: Date.now(),
    });
    console.log(`[sessionWorkflow] restageOpenTurn chatId=${args.chatId}`);
    return { restaged: true as const };
  },
});

/**
 * Daemon-minted continuation turn. Inserts an assistant placeholder and arms a
 * stale handler so a crashed daemon cannot leave an empty bubble forever.
 */
export const openSyntheticTurn = authMutation({
  args: {
    ...daemonChatTargetArgs,
    model: v.optional(aiModelValidator),
  },
  returns: v.object({
    messageId: v.id("messages"),
    turnId: v.id("turns"),
    leaseGeneration: v.number(),
  }),
  handler: async (ctx, args) => {
    const chatId = await resolveDaemonChatId(ctx.db, args);
    if (chatId === null) throw new Error("Chat not found");
    const { chat, session } = await getSessionChatOrThrow(ctx.db, chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const turnModel = normalizeAIModel(args.model ?? chat.lastModel);
    const { messageId, replyTo } = await insertTurnFollowUp(ctx, {
      parentId: chat._id,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      activityLog: "",
      isSyntheticTurn: true,
      model: turnModel,
    });
    const turnId = await openSessionChatTurn(ctx, {
      chatId: chat._id,
      sessionId: session._id,
      streamingEntityId: sessionChatStreamingEntityId(chat._id),
      placeholderMessageId: messageId,
      replyTo,
      prompt: "[synthetic continuation]",
      model: turnModel,
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
    const lease = await leaseSyntheticTurn(ctx, turnId);
    await ctx.db.patch(chat._id, {
      syntheticTurnMessageId: messageId,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.sessionWorkflow.handleStaleSyntheticTurn,
      { chatId: chat._id, messageId },
    );
    return { messageId, ...lease };
  },
});

/** Finalizes a synthetic continuation turn by messageId (never recency). */
export const completeSyntheticTurn = authMutation({
  args: {
    ...daemonChatTargetArgs,
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
    const chatId = await resolveDaemonChatId(ctx.db, args);
    if (chatId === null) return null;
    const { chat, session } = await getSessionChatOrThrow(ctx.db, chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    const streamingEntityId = sessionChatStreamingEntityId(chat._id);
    const turnResolution = await resolveCompletionTurn(ctx, {
      entityId: chat._id,
      turnId: args.turnId,
      leaseGeneration: args.leaseGeneration,
      placeholderMessageId: args.messageId,
    });
    if (turnResolution.status === "stale") return null;
    if (turnResolution.status === "current") {
      await advanceTurn(ctx, turnResolution.turn, "finalizing");
    }
    await clearStreamingActivity(ctx, streamingEntityId);

    const message = await ctx.db.get(args.messageId);
    if (
      !message ||
      message.parentId !== chat._id ||
      message.finishedAt !== undefined
    ) {
      await ctx.db.patch(chat._id, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      if (turnResolution.status === "current") {
        await closeTurn(ctx, turnResolution.turn, "error", {
          error: "Synthetic turn placeholder was no longer available",
        });
      }
      await drainSessionChatQueues(ctx, session._id, chat._id);
      return null;
    }

    const patch = syntheticTurnCompletionPatch(args);
    await ctx.db.patch(args.messageId, patch);
    await scheduleScopeCheck(ctx, {
      _id: args.messageId,
      beforeSha: patch.beforeSha,
      afterSha: patch.afterSha,
    });

    await ctx.db.patch(chat._id, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(session._id, {
      updatedAt: Date.now(),
      agentBrowsingAt: undefined,
    });
    if (turnResolution.status === "current") {
      await closeTurn(
        ctx,
        turnResolution.turn,
        args.success ? "done" : "error",
        args.error ? { error: args.error } : {},
      );
    }
    await drainSessionChatQueues(ctx, session._id, chat._id);
    return null;
  },
});

/** Crash hygiene for daemon-minted continuations left open after daemon death. */
export const handleStaleSyntheticTurn = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.syntheticTurnMessageId !== args.messageId) {
      return null;
    }

    const message = await ctx.db.get(args.messageId);
    if (!message || message.finishedAt !== undefined) {
      await ctx.db.patch(chat._id, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      return null;
    }

    const streamingEntityId = sessionChatStreamingEntityId(chat._id);
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
      .first();
    const streamingStale = isStreamingActivityStale(streaming);
    if (!streamingStale) {
      await ctx.scheduler.runAfter(
        10 * 60 * 1000,
        internal.sessionWorkflow.handleStaleSyntheticTurn,
        { chatId: chat._id, messageId: args.messageId },
      );
      return null;
    }

    await finalizeCancelledAssistantMessage(ctx, message, streaming);
    const openTurn = await findOpenTurn(ctx, chat._id);
    if (openTurn?.placeholderMessageId === args.messageId) {
      await closeTurn(ctx, openTurn, "error", {
        error: "Synthetic turn stopped reporting activity",
      });
    }
    await clearStreamingActivity(ctx, streamingEntityId);
    await ctx.db.patch(chat._id, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    await drainSessionChatQueues(ctx, chat.sessionId, chat._id);
    return null;
  },
});

/** Receives sandbox completion callback and forwards the event to the chat's active workflow. */
export const handleCompletion = authMutation({
  args: {
    ...daemonChatTargetArgs,
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    pendingQuestion: v.optional(v.string()),
    ...turnLeaseFenceArgs,
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const completionStartedAt = Date.now();
    const chatId = await resolveDaemonChatId(ctx.db, args);
    if (chatId === null) return null;
    const context = await loadSessionChat(ctx.db, chatId);
    if (!context) return null;
    const { chat, session } = context;
    const activeWorkflowId = await openTurnWorkflowId(ctx, chat._id);
    if (activeWorkflowId === undefined) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const turnResolution = await resolveCompletionTurn(ctx, {
      entityId: chat._id,
      turnId: args.turnId,
      leaseGeneration: args.leaseGeneration,
    });
    if (turnResolution.status === "stale") return null;
    if (turnResolution.status === "current") {
      await advanceTurn(ctx, turnResolution.turn, "finalizing");
    }

    console.log(
      `[sessionWorkflow] handleCompletion received chatId=${chat._id} success=${args.success} workflowId=${activeWorkflowId}`,
    );

    if (chat.pendingTurn !== undefined) {
      await ctx.db.patch(chat._id, { pendingTurn: undefined });
    }

    await workflow.sendEvent(ctx, {
      ...sessionCompleteEvent,
      workflowId: toWorkflowId(activeWorkflowId),
      value: {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
        pendingQuestion: args.pendingQuestion,
        beforeSha: args.beforeSha,
        afterSha: args.afterSha,
        beforeShas: args.beforeShas,
        afterShas: args.afterShas,
      },
    });

    await recordCompletionLog(ctx, {
      entityType: "session",
      entityId: String(chat._id),
      entityTitle: session.title,
      repoId: session.repoId,
      rawResultEvent: args.rawResultEvent,
    });

    console.log(
      `[sessionWorkflow] handleCompletion finished in ${Date.now() - completionStartedAt}ms chatId=${chat._id}`,
    );

    return null;
  },
});
