import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow } from "../workflowManager";
import { ensureSandboxStartedSteps } from "../_sandbox_runtime/resumeSandboxSteps";
import { authMutation, hasRepoAccess } from "../functions";
import {
  aiModelValidator,
  DEFAULT_AI_MODEL,
  reasoningLevelValidator,
  workflowCompleteValidator,
  normalizeAIModel,
  sessionStatusValidator,
  turnCheckpointArgs,
  usesChatDaemon,
  interactionModeValidator,
} from "../validators";
import { resolveSessionBaseBranch } from "./baseBranch";
import {
  recordCompletionLog,
  sendCompletionEvent,
  clearStreamingActivity,
  extractFirstJsonValue,
} from "../_taskWorkflow/helpers";
import {
  scheduleQueueDrainAfterBackgroundAgents,
  startNextQueuedSessionMessage,
} from "../_queues/helpers";
import { resolveMessageTokens } from "../_mentions/resolveMessageTokens";
import { buildCustomInstructionsBlock } from "../prompts";
import { buildEditPrompt, buildOrchestratorPrompt } from "./prompts";
import { listReadableSiblingRepos } from "../_githubRepos/sandboxRead";
import { z } from "zod";
import { formatDelayedPublishFailureError } from "./resultTarget";
import {
  applyChatTurnResult,
  insertAssistantPlaceholderIfNeeded,
} from "../_chat/chatResult";
import { resolveStorageUrls } from "../_chat/storageUrls";
import { isUnclaimedOpenTurn } from "./pendingTurnRecovery";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { finalizeCancelledAssistantMessage } from "../streaming";
import { backgroundAgentEntryValidator } from "../_validators/tableFields";
import { mergeBackgroundAgents } from "./backgroundAgents";
import { prependModelHandoffContext } from "../_shared/modelHandoff";
import { isDaemonClaimPaused } from "../_chat/daemonClaimPause";
import {
  ensureSessionDaemonState,
  syncSessionDaemonState,
} from "./daemonState";
import {
  acquireTurnLease,
  advanceTurn,
  closeTurn,
  findOpenSessionTurn,
  openSessionTurn,
  resolveCompletionTurn,
} from "../_chat/turnStore";

// --- Completion event ---

export const sessionCompleteEvent = defineEvent({
  name: "sessionComplete",
  validator: workflowCompleteValidator,
});

// --- Turn config ---

/**
 * Tools every session turn may use. Skill is required so the harness can invoke
 * Eva's system skills (eva-plan, eva-design, eva-ask, eva-capture, eva-audit), which is
 * how planning and design work now that turn modes are gone.
 */
export const SESSION_TOOLS = "Read,Write,Edit,Bash,Glob,Grep,Skill";

/**
 * The master ("orchestrator") session's tools: `SESSION_TOOLS` minus Write and
 * Edit. Manager Ave supervises agents and never implements, so the two tools
 * that make implementation possible are withheld rather than merely discouraged
 * — a prompt alone did not stop it. Bash stays: the supervision skill reads
 * production logs and CI state through it (`npx convex logs`, `gh pr checks`),
 * which is read-only in intent and enforced by prompt, not by tool list.
 *
 * This string is a Claude tool vocabulary and only the Claude SDK path reads it
 * (`ALLOWED_TOOLS` in `callback-src/providers/claudeSdk.ts`). The other SDKs
 * name their tools differently, so the cross-provider signal is the separate
 * `noWrites` flag below rather than this list.
 */
export const ORCHESTRATOR_TOOLS = "Read,Bash,Glob,Grep,Skill";

/** Launch config for a session's turns, derived once from what the session is. */
export type SessionTurnTools = {
  /** Claude-vocabulary allowlist; ignored by every other provider. */
  allowedTools: string;
  /**
   * Provider-agnostic "this turn may not modify the workspace". Each SDK
   * translates it into its own vocabulary — Cursor `disallowedTools`, Codex
   * `sandboxMode: "read-only"` — so no provider has to understand Claude's
   * tool names. Absent rather than `false` for a writing session: it is spread
   * into launch args, and an omitted key keeps their opts signature unchanged.
   */
  noWrites?: true;
};

/**
 * Tools and write permission for a session's turns.
 *
 * One function returning both because both feed the warm-daemon opts signature
 * (`buildDaemonOptsSig`): if a call site set one without the other, the daemon
 * would either optsmismatch-kill and respawn every turn, or — worse — keep
 * serving a warm process that still holds its write tools.
 */
export function sessionTurnTools(
  isOrchestrator: boolean | undefined,
): SessionTurnTools {
  return isOrchestrator === true
    ? { allowedTools: ORCHESTRATOR_TOOLS, noWrites: true }
    : { allowedTools: SESSION_TOOLS };
}

/**
 * The `eva-design` reply contract. `variations` must be present and non-empty:
 * an all-optional schema matched a bare `{}` in an ordinary reply and turned it
 * into an empty Designs tab.
 */
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

/** Parses the design-variations JSON a turn may end with. */
function parseDesignResult(
  text: string | null,
): z.infer<typeof designResultSchema> | null {
  if (!text) return null;
  const raw = extractFirstJsonValue(text);
  const parsed = designResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Finalizes and clears an open synthetic-turn placeholder on session hygiene paths. */
async function finalizeOpenSyntheticTurn(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  syntheticTurnMessageId: Id<"messages"> | undefined,
): Promise<void> {
  if (syntheticTurnMessageId === undefined) return;
  const syntheticMessage = await ctx.db.get(syntheticTurnMessageId);
  if (syntheticMessage && syntheticMessage.finishedAt === undefined) {
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", String(sessionId)))
      .first();
    await finalizeCancelledAssistantMessage(ctx, syntheticMessage, streaming);
  }
  await ctx.db.patch(sessionId, { syntheticTurnMessageId: undefined });
}

/**
 * Builds the agent prompt for a session turn (doc `@` mentions resolved, custom
 * instructions + system prompt folded in). Shared single source of truth so
 * both the workflow's `getSessionData` query and the daemon-pull `startExecute`
 * mutation produce byte-identical prompts — the daemon must run exactly what
 * the workflow would have handed it, never a second variant. Takes
 * already-fetched session/repo/user docs so it works from either a query or a
 * mutation context (MutationCtx satisfies QueryCtx for the read-only mention
 * resolution).
 */
export async function buildSessionPrompt(
  ctx: QueryCtx,
  args: {
    session: Doc<"sessions">;
    repo: Doc<"githubRepos">;
    user: Doc<"users"> | null;
    message: string;
    /** Model this turn runs on; decides whether a handoff catch-up is needed. */
    model: string;
  },
): Promise<{ prompt: string; branchName: string }> {
  const { session, repo, user } = args;
  const rootDirectory = repo.rootDirectory ?? "";
  const customInstructionsBlock = buildCustomInstructionsBlock(
    user?.role ?? undefined,
    user?.customInstructions ?? undefined,
  );

  const branchName = session.branchName || `eva/session-${session._id}`;

  const { resolvedMessage, prefixBlock } = await resolveMessageTokens(
    ctx,
    args.message,
    session.repoId,
  );

  // The master supervises rather than builds, so it gets none of the edit
  // contract below — not the branch, not the commit line, not the repo system
  // prompt (which is implementation guidance for the checked-out app).
  if (session.isOrchestrator === true) {
    let prompt = prefixBlock
      ? `${prefixBlock}\n\n${buildOrchestratorPrompt(resolvedMessage, customInstructionsBlock)}`
      : buildOrchestratorPrompt(resolvedMessage, customInstructionsBlock);
    // Ave can switch providers mid-chat; catch the incoming CLI up the same way.
    prompt = await prependModelHandoffContext(
      ctx,
      session._id,
      args.model,
      session.provider,
      prompt,
    );
    return { prompt, branchName };
  }

  // Sibling repositories this sandbox's git credentials can read (owner is the
  // session owner, whose access the credential helper mints tokens against).
  const readableRepos = await listReadableSiblingRepos(
    ctx.db,
    session.userId,
    repo._id,
  );

  // Cursor resumes the saved SDK agent; the Eva transcript is not stuffed
  // in as a rotation handoff. Session plan.md / planContent is not injected —
  // that was the old Plan/Build mode contract.
  let prompt = buildEditPrompt(
    {
      owner: repo.owner,
      name: repo.name,
      baseBranch: resolveSessionBaseBranch(session, repo),
    },
    branchName,
    "",
    resolvedMessage,
    rootDirectory,
    customInstructionsBlock,
    repo.systemPrompt,
    session.devPort ?? repo.devPort,
    [],
    readableRepos,
  );
  if (prefixBlock) {
    prompt = `${prefixBlock}\n\n${prompt}`;
  }
  // Last, so the catch-up block leads the whole prompt.
  prompt = await prependModelHandoffContext(
    ctx,
    session._id,
    args.model,
    session.provider,
    prompt,
  );
  return { prompt, branchName };
}

// --- Workflows ---

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
    });
  },
});

/** Runs a session message through the sandbox agent. */
export const sessionExecuteWorkflow = workflow.define({
  args: {
    sessionId: v.id("sessions"),
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
    // Missing only for workflows that were already in flight at the durable
    // Turn cutover. Every new start supplies this discriminator.
    turnId: v.optional(v.id("turns")),
  },
  handler: async (step, args): Promise<void> => {
    await step.runMutation(internal.sessionWorkflow.addAssistantPlaceholder, {
      sessionId: args.sessionId,
    });

    const data = await step.runQuery(internal.sessionWorkflow.getSessionData, {
      sessionId: args.sessionId,
      message: args.message,
      model: args.model,
      userId: args.userId,
    });

    // Daemon-pull dispatch: the prompt is NOT pushed from here. `startExecute`
    // has already staged it in `session.pendingTurn` and scheduled a daemon to
    // claim it; the warm daemon pulls it via `claimPendingTurn` in ~one poll,
    // which is why we no longer probe/handoff/launch WITH a prompt here (doing
    // so would double-execute the turn). This workflow's remaining job is to
    // (a) make sure the sandbox is started (thawing cold/archived storage over
    // durable steps) and a daemon is alive to do the claim, then (b) awaitEvent
    // + run the unchanged post-turn bookkeeping (branch push, saveResult,
    // deployment tracking).
    let sandboxId: string | null = null;
    let validatedSandboxId: string | null = null;

    if (data.sandboxId) {
      // Bring an archived/stopped sandbox back to "started" via durable polling
      // steps first, so a multi-minute cold-storage thaw doesn't blow the
      // per-action 10-minute limit inside validateSandbox. Once started, the
      // validate below hits its fast (echo) path.
      let started: Awaited<ReturnType<typeof ensureSandboxStartedSteps>>;
      try {
        started = await ensureSandboxStartedSteps(step, {
          sandboxId: data.sandboxId,
          repoId: data.repoId,
          streamingEntityId: args.sessionId,
          sandboxRunning: data.status === "active",
        });
      } catch (error) {
        await step.runMutation(internal.sessionWorkflow.saveResult, {
          sessionId: args.sessionId,
          ...(args.turnId !== undefined ? { turnId: args.turnId } : {}),
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
          { sandboxId: thawId, repoId: data.repoId },
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
          sessionId: args.sessionId,
          existingSandboxId: data.sandboxId,
          installationId: args.installationId,
          repoOwner: data.repoOwner,
          repoName: data.repoName,
          branchName: data.branchName ?? `eva/session-${args.sessionId}`,
          baseBranch: data.baseBranch,
          repoId: data.repoId,
          startDesktop: false,
        },
        { retry: { maxAttempts: 2, initialBackoffMs: 2000, base: 2 } },
      );
      sandboxId = prepared.sandboxId;

      await step.runMutation(internal.sessionWorkflow.updateSandboxId, {
        sessionId: args.sessionId,
        sandboxId,
        branchName: data.branchName,
      });
    }

    if (sandboxId === null) {
      // Unreachable: sandboxId is assigned on both branches above.
      throw new Error("sessionExecuteWorkflow: sandbox was not resolved");
    }

    // Preserve the exact V1 journal for workflows started before the cutover:
    // workflow steps are replayed by order, so even one new call would strand
    // an in-flight execution with a journal mismatch.
    if (args.turnId !== undefined) {
      await step.runMutation(internal.turns.markLaunching, {
        turnId: args.turnId,
        sandboxId,
      });
    }

    // A cancel can race with startExecute and wipe pendingTurn while a daemon
    // workflow waits, so restage it before ensuring the warm process.
    if (usesChatDaemon(data.model)) {
      await step.runMutation(internal.sessionWorkflow.ensurePendingTurn, {
        sessionId: args.sessionId,
        prompt: data.prompt,
        attachmentStorageIds: data.attachmentStorageIds,
        model: args.model,
      });
    }

    // Persistent chat providers use prewarm + claimPendingTurn.
    if (usesChatDaemon(data.model)) {
      await step.runAction(internal.sandbox.prewarmSessionDaemon, {
        sandboxId,
        sessionId: args.sessionId,
        repoId: data.repoId,
        userId: args.userId,
        model: data.model,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
        ...sessionTurnTools(data.isOrchestrator),
        providerAccountId: args.providerAccountId,
        credentialOwnerUserId: args.credentialOwnerUserId,
        sessionPersistenceId: args.sessionId,
      });
    } else {
      // A failed launch must finalize the turn: without this catch the
      // workflow dies after its step retries with no saveResult, leaving the
      // empty placeholder (and activeWorkflowId) stuck on "Working…" until
      // the 2-hour backstop.
      try {
        const turnLease =
          args.turnId === undefined
            ? null
            : await step.runMutation(internal.turns.acquireOneShotLease, {
                turnId: args.turnId,
                sandboxId,
              });
        if (args.turnId !== undefined && turnLease === null) {
          await step.runMutation(internal.sessionWorkflow.saveResult, {
            sessionId: args.sessionId,
            turnId: args.turnId,
            success: false,
            result: null,
            error: "The turn no longer owns this session. Please retry.",
            activityLog: null,
          });
          return;
        }
        await step.runAction(internal.sandbox.launchOnExistingSandbox, {
          sandboxId,
          entityId: String(args.sessionId),
          prompt: data.prompt,
          userId: args.userId,
          completionMutation: "sessionWorkflow:handleCompletion",
          entityIdField: "sessionId",
          model: data.model,
          reasoningLevel: args.reasoningLevel,
          thinkingEnabled: args.thinkingEnabled,
          use1mContext: args.use1mContext,
          fastMode: args.fastMode,
          ...sessionTurnTools(data.isOrchestrator),
          repoId: data.repoId,
          streamingEntityId: String(args.sessionId),
          sessionPersistenceId: args.sessionId,
          providerAccountId: args.providerAccountId,
          credentialOwnerUserId: args.credentialOwnerUserId,
          attachmentStorageIds: data.attachmentStorageIds,
          ...(turnLease !== null
            ? {
                turnId: turnLease.turnId,
                turnLeaseGeneration: turnLease.leaseGeneration,
              }
            : {}),
        });
      } catch (error) {
        await step.runMutation(internal.sessionWorkflow.saveResult, {
          sessionId: args.sessionId,
          ...(args.turnId !== undefined ? { turnId: args.turnId } : {}),
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

    // Persist the assistant reply BEFORE publish. A hung/slow git push used to
    // leave the UI on "Working…" forever even after the daemon had completed —
    // streamed tokens may also be empty for short conversational-ish agent
    // turns. Publish failures are patched onto the saved message below.
    await step.runMutation(internal.sessionWorkflow.saveResult, {
      sessionId: args.sessionId,
      ...(args.turnId !== undefined ? { turnId: args.turnId } : {}),
      success: result.success,
      result: result.result,
      error: result.error,
      activityLog: result.activityLog,
      model: args.model,
      pendingQuestion: result.pendingQuestion,
      beforeSha: result.beforeSha,
      afterSha: result.afterSha,
    });

    // Eva owns publishing: the agent commits inside the sandbox but never
    // pushes (see prompts.ts). Always attempt the push after a successful
    // AGENT turn — matching project/task chat. Do NOT gate on
    // `git status --porcelain`: after a proper commit the tree is clean, so
    // that check skipped every publish and left commits stranded in the
    // sandbox. pushBranchToOrigin itself skips when HEAD has no commits
    // origin lacks, so chat-only turns publish nothing.
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
          `[sessionWorkflow] pushSandboxBranch failed sessionId=${args.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await step.runMutation(internal.sessionWorkflow.saveResult, {
          sessionId: args.sessionId,
          ...(args.turnId !== undefined ? { turnId: args.turnId } : {}),
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
          sessionId: args.sessionId,
          installationId: args.installationId,
          repoOwner: data.repoOwner,
          repoName: data.repoName,
          repoId: data.repoId,
          branchName: data.branchName,
          deploymentProjectName: data.deploymentProjectName,
        },
      );

      // The callback normally pushes before posting completion so the work is
      // durable even if the sandbox dies immediately afterwards. In that path
      // this workflow's redundant push reports `pushed: false`; recover a
      // missing PR when it confirms the session branch already contains HEAD.
      // A chat-only first turn has no remote session branch, so `published` is
      // false and still avoids the old compare-404 alerts.
      if (pushedCommits || (branchPublished && data.prUrl === undefined)) {
        try {
          await step.runAction(internal.github.createDraftSessionPr, {
            sessionId: args.sessionId,
          });
        } catch (error) {
          const errorDetail =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[sessionWorkflow] createDraftSessionPr failed sessionId=${args.sessionId}: ${errorDetail}`,
          );
          await step.runMutation(internal.sessionWorkflow.postSystemAlert, {
            sessionId: args.sessionId,
            content: "Failed to create draft PR",
            errorDetail,
          });
        }
      }
    }
  },
});

// --- Deployment tracking ---

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

// --- Supporting internal functions ---

/** Posts a non-streaming system alert into the session chat (e.g. draft PR failure). */
export const postSystemAlert = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    content: v.string(),
    errorDetail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      parentId: args.sessionId,
      role: "assistant",
      content: args.content,
      timestamp: Date.now(),
      isSystemAlert: true,
      ...(args.errorDetail !== undefined && { errorDetail: args.errorDetail }),
    });
    await ctx.db.patch(args.sessionId, { updatedAt: Date.now() });
    return null;
  },
});

/** Clears stuck empty Working bubbles + leftover streaming for a session. */
export const clearStuckWorkingState = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.object({
    deletedPlaceholders: v.number(),
    clearedStreaming: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
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
    const session = await ctx.db.get(args.sessionId);
    if (session?.syntheticTurnMessageId) {
      await finalizeOpenSyntheticTurn(
        ctx,
        args.sessionId,
        session.syntheticTurnMessageId,
      );
    }
    await clearStreamingActivity(ctx, String(args.sessionId));
    await ctx.db.patch(args.sessionId, {
      activeWorkflowId: undefined,
      pendingTurn: undefined,
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    if (session) {
      await syncSessionDaemonState(ctx, session, { pendingTurn: undefined });
      const turn = await findOpenSessionTurn(ctx, args.sessionId);
      if (turn) {
        await closeTurn(ctx, turn, "error", {
          error: "Turn state was cleared during recovery",
        });
      }
    }
    return { deletedPlaceholders, clearedStreaming: true };
  },
});

/**
 * Inserts an empty assistant message into the session for streaming updates.
 * Idempotent: the daemon-pull `startExecute` already inserts this placeholder
 * before starting the workflow, so if the last message is already an empty
 * assistant placeholder we skip, avoiding a duplicate.
 */
export const addAssistantPlaceholder = internalMutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Ignore system alerts (e.g. draft-PR failures) sitting on top — startExecute
    // may already have staged an empty placeholder underneath them.
    await insertAssistantPlaceholderIfNeeded(ctx, {
      parentId: args.sessionId,
      recentLimit: 10,
      skipSystemAlerts: true,
    });
    return null;
  },
});

/** Fetches session and repo data, builds the turn prompt, and resolves branch config. */
export const getSessionData = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
    model: aiModelValidator,
    userId: v.id("users"),
  },
  returns: v.object({
    sandboxId: v.optional(v.string()),
    status: sessionStatusValidator,
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    prompt: v.string(),
    branchName: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    baseBranch: v.string(),
    model: aiModelValidator,
    deploymentProjectName: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    /** Selects the master's reduced tool set — see `sessionTurnTools`. */
    isOrchestrator: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    const user = await ctx.db.get(args.userId);
    const { prompt, branchName } = await buildSessionPrompt(ctx, {
      session,
      repo,
      user,
      message: args.message,
      model: args.model,
    });

    // Input images attached to the triggering user message. Used to re-stage
    // pendingTurn on the queued/cancel-race path (immediate sends stage them
    // directly in startExecute).
    const triggeringUserMessage = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .order("desc")
      .filter((q) => q.eq(q.field("role"), "user"))
      .first();

    return {
      sandboxId: session.sandboxId,
      status: session.status,
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: session.repoId,
      prompt,
      branchName,
      prUrl: session.prUrl,
      baseBranch: resolveSessionBaseBranch(session, repo),
      model: normalizeAIModel(args.model),
      deploymentProjectName: repo.deploymentProjectName,
      attachmentStorageIds: triggeringUserMessage?.attachmentStorageIds,
      isOrchestrator: session.isOrchestrator,
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

/** Saves the session execution result, updating the last message and starting queued messages. */
export const saveResult = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    turnId: v.optional(v.id("turns")),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    /** Stamped onto the reply on success, making it this provider's checkpoint. */
    model: v.optional(aiModelValidator),
    planContent: v.optional(v.string()),
    pendingQuestion: v.optional(v.string()),
    /** Turn checkpoint from the callback (see messageFields.beforeSha). */
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    // Any successful turn may have ended with the eva-design JSON, so this is
    // keyed on the reply's content rather than on what the turn was asked to do.
    const designParsed = args.success ? parseDesignResult(args.result) : null;
    const extraPatch: {
      isSystemAlert?: boolean;
      errorDetail?: string;
      beforeSha?: string;
      afterSha?: string;
      variations?: Array<{
        label: string;
        route?: string;
        filePath?: string;
      }>;
    } = {
      isSystemAlert: undefined,
      errorDetail: undefined,
    };
    if (designParsed) {
      extraPatch.variations = designParsed.variations.map((variation) => ({
        label: variation.label,
        route: variation.route,
        filePath: variation.filePath,
      }));
    }
    if (args.beforeSha !== undefined && args.afterSha !== undefined) {
      extraPatch.beforeSha = args.beforeSha;
      extraPatch.afterSha = args.afterSha;
    }

    const outcome = await applyChatTurnResult(ctx, {
      parentId: args.sessionId,
      streamingEntityId: String(args.sessionId),
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

    const sessionPatch: {
      activeWorkflowId?: string;
      updatedAt: number;
      planContent?: string;
      agentBrowsingAt?: undefined;
    } = {
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
      // Crash hygiene: drop stale soft-lock if the agent forgot browser_unlock.
      agentBrowsingAt: undefined,
    };
    if (args.planContent && args.planContent !== session.planContent) {
      sessionPatch.planContent = args.planContent;
    }
    await ctx.db.patch(args.sessionId, sessionPatch);
    if (args.turnId !== undefined) {
      const turn = await ctx.db.get(args.turnId);
      if (turn) {
        await closeTurn(
          ctx,
          turn,
          args.success ? "done" : "error",
          args.error ? { error: args.error } : {},
        );
      }
    }
    await startNextQueuedSessionMessage(ctx, args.sessionId);
    return null;
  },
});

/**
 * Daemon-pull turn claim. The warm sandbox daemon polls this every ~50ms; when
 * `startExecute` has staged a prompt in `session.pendingTurn`, this atomically
 * hands it over and clears the field so the same prompt is never claimed twice
 * (which would double-execute the turn). Returns `{ prompt: null }` when nothing
 * is pending. Also doubles as the interrupt-cancel channel: `cancelRequested`
 * drains unconditionally (even mid-turn, with no pendingTurn) so a Claude
 * daemon polling during an active turn learns to abort it. Public + auth-gated
 * (via the sandbox CONVEX_TOKEN identity) to match `handleCompletion` — the
 * daemon calls it over `/api/mutation`, and internal mutations are not
 * reachable there.
 */
export const claimPendingTurn = authMutation({
  args: {
    sessionId: v.id("sessions"),
    model: v.optional(aiModelValidator),
    // When false, drain cancel/stop/usage only. Old sandboxes omit this and
    // keep acquiring the running lease (previous behaviour).
    acceptTurn: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      prompt: v.union(v.string(), v.null()),
      turnLifecycle: v.literal("legacy"),
      // Resolved download URLs for this turn's input image attachments. The daemon
      // fetches these and hands the agent local file paths before running the turn.
      attachmentUrls: v.array(v.string()),
      stopTaskToolUseIds: v.array(v.string()),
      cancelRequested: v.boolean(),
      usageRefreshRequested: v.boolean(),
      interactionMode: v.optional(interactionModeValidator),
    }),
    v.object({
      prompt: v.string(),
      turnLifecycle: v.literal("durable"),
      turnId: v.id("turns"),
      leaseGeneration: v.number(),
      attachmentUrls: v.array(v.string()),
      stopTaskToolUseIds: v.array(v.string()),
      cancelRequested: v.boolean(),
      usageRefreshRequested: v.boolean(),
      interactionMode: v.optional(interactionModeValidator),
    }),
  ),
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
    let daemonState = await ctx.db
      .query("sessionDaemonStates")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (!daemonState) {
      const session = await ctx.db.get(args.sessionId);
      if (!session) return emptyClaim;
      await ensureSessionDaemonState(ctx, session);
      daemonState = await ctx.db
        .query("sessionDaemonStates")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .unique();
      if (!daemonState) return emptyClaim;
    }
    // The normal owner path now reads only this small row, not the session's
    // plan, terminal history, panes, and other UI state on every 50ms poll.
    if (daemonState.userId !== ctx.userId) {
      if (!(await hasRepoAccess(ctx.db, daemonState.repoId, ctx.userId)))
        throw new Error("Not authorized");
    }

    // Level-triggered: an old callback that does not read this field must not
    // consume it. The refresh action clears `usageRefreshRequestedAt` when it
    // stops waiting so a failed lookup can retry until then.
    const usageRefreshRequested =
      daemonState.usageRefreshRequestedAt !== undefined;

    // Withhold the turn while a new session's sandbox is still pulling the
    // latest base branch and reinstalling drifted deps (flag set at early-ready,
    // cleared when setup finishes). Returning an empty claim leaves pendingTurn
    // intact; the daemon keeps polling (45m idle budget) and claims the moment
    // the gate clears, so the agent never executes against a stale checkout.
    // The usage flag is still returned: get_usage does not need a user turn.
    if (daemonState.sandboxSetupPending === true) {
      return { ...emptyClaim, usageRefreshRequested };
    }

    const stopTaskToolUseIds = daemonState.pendingTaskStops ?? [];
    if (stopTaskToolUseIds.length > 0) {
      await ctx.db.patch(daemonState._id, { pendingTaskStops: undefined });
      await ctx.db.patch(args.sessionId, { pendingTaskStops: undefined });
    }

    // Cancel must drain the same way as stopTaskToolUseIds above: the daemon
    // polls this mutation continuously, including mid-turn, specifically to
    // notice an interrupt — gating the drain on pendingTurn would strand it.
    const cancelRequested = daemonState.cancelRequestedAt !== undefined;
    if (cancelRequested) {
      await ctx.db.patch(daemonState._id, { cancelRequestedAt: undefined });
      await ctx.db.patch(args.sessionId, { cancelRequestedAt: undefined });
    }

    // A prewarm is killing this daemon right now (stale callback bundle or a
    // model/tools change). Handing it the turn in the milliseconds before the
    // kill lands acquires the 2-minute running lease for a process that is
    // already dying, and nothing heartbeats it — the "Turn stalled" alert of
    // session 125. pendingTurn stays staged for the replacement daemon; the
    // drains above still ran, so a cancel is never stranded by the pause.
    if (
      isDaemonClaimPaused({
        claimPausedUntil: daemonState.claimPausedUntil,
        now: Date.now(),
      })
    ) {
      return {
        ...emptyClaim,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    if (!daemonState.pendingTurn) {
      return {
        ...emptyClaim,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    // The daemon is not ready to start (still finalizing, synthetic open, or
    // a real turn in flight). Leave pendingTurn so the 2-minute running lease
    // is not acquired with nobody heartbeating it (session 65 / session 125).
    if (args.acceptTurn === false) {
      return {
        ...emptyClaim,
        stopTaskToolUseIds,
        cancelRequested,
        usageRefreshRequested,
      };
    }

    const pendingModel = daemonState.pendingTurn.model;
    if (pendingModel !== undefined) {
      const claimModel = normalizeAIModel(args.model);
      if (normalizeAIModel(pendingModel) !== claimModel) {
        console.log(
          `[sessionWorkflow] claimPendingTurn model mismatch sessionId=${args.sessionId} pending=${pendingModel} claim=${claimModel}`,
        );
        return {
          ...emptyClaim,
          stopTaskToolUseIds,
          cancelRequested,
          usageRefreshRequested,
        };
      }
    }

    const prompt = daemonState.pendingTurn.prompt;
    const claimWaitMs = Date.now() - daemonState.pendingTurn.requestedAt;
    const attachmentUrls = await resolveStorageUrls(
      (id) => ctx.storage.getUrl(id),
      daemonState.pendingTurn.attachmentStorageIds,
    );
    let turnLease: { turnId: Id<"turns">; leaseGeneration: number } | null =
      null;
    const pendingTurnId = daemonState.pendingTurn.turnId;
    if (pendingTurnId !== undefined) {
      const turn = await ctx.db.get(pendingTurnId);
      if (!turn || !turn.open || turn.state === "running") {
        await ctx.db.patch(daemonState._id, { pendingTurn: undefined });
        await ctx.db.patch(args.sessionId, { pendingTurn: undefined });
        return {
          ...emptyClaim,
          stopTaskToolUseIds,
          cancelRequested,
          usageRefreshRequested,
        };
      }
      turnLease = await acquireTurnLease(ctx, turn, "running");
      if (turnLease === null) {
        return {
          ...emptyClaim,
          stopTaskToolUseIds,
          cancelRequested,
          usageRefreshRequested,
        };
      }
    }
    await ctx.db.patch(daemonState._id, { pendingTurn: undefined });
    await ctx.db.patch(args.sessionId, { pendingTurn: undefined });
    console.log(
      `[sessionWorkflow] claimPendingTurn sessionId=${args.sessionId} claimWaitMs=${claimWaitMs} attachments=${attachmentUrls.length}`,
    );
    const claimedTurn = {
      prompt,
      attachmentUrls,
      stopTaskToolUseIds,
      cancelRequested,
      usageRefreshRequested,
      interactionMode: "default" as const,
    };
    if (turnLease === null) {
      const turnLifecycle = "legacy" as const;
      return { ...claimedTurn, turnLifecycle };
    }
    const turnLifecycle = "durable" as const;
    return { ...claimedTurn, turnLifecycle, ...turnLease };
  },
});

/** Daemon patches background Agent/Task lifecycle entries (start/settle only). */
export const updateBackgroundAgents = authMutation({
  args: {
    sessionId: v.id("sessions"),
    agents: v.array(backgroundAgentEntryValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");
    if (args.agents.length === 0) return null;

    const backgroundAgents = mergeBackgroundAgents(
      session.backgroundAgents,
      args.agents,
    );
    await ctx.db.patch(args.sessionId, {
      backgroundAgents,
      updatedAt: Date.now(),
    });
    // Queued messages wait for these agents, so their settling is a queue
    // release the session itself never signals otherwise.
    await scheduleQueueDrainAfterBackgroundAgents(
      ctx,
      args.sessionId,
      backgroundAgents,
    );
    return null;
  },
});

/** User-facing stop request for a background agent; drained via claimPendingTurn. */
export const requestStopBackgroundAgent = authMutation({
  args: {
    sessionId: v.id("sessions"),
    toolUseId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const pending = session.pendingTaskStops ?? [];
    if (pending.includes(args.toolUseId)) return null;

    await ctx.db.patch(args.sessionId, {
      pendingTaskStops: [...pending, args.toolUseId],
      updatedAt: Date.now(),
    });
    await syncSessionDaemonState(ctx, session, {
      pendingTaskStops: [...pending, args.toolUseId],
    });
    return null;
  },
});

/**
 * Re-stages `pendingTurn` when a cancel raced with startExecute and wiped the
 * prompt while the workflow is still waiting on sessionComplete. No-op when a
 * turn is already pending or the latest assistant message already finished.
 */
export const ensurePendingTurn = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    prompt: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    model: v.optional(aiModelValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    // One-shot providers push the prompt; restaging would only spam a leftover
    // A leftover daemon would otherwise emit claimPendingTurn mismatch logs.
    if (args.model !== undefined && !usesChatDaemon(args.model)) {
      return null;
    }

    const openTurn = await findOpenSessionTurn(ctx, args.sessionId);
    if (openTurn && openTurn.state === "running") return null;
    const last = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .order("desc")
      .first();
    if (
      !isUnclaimedOpenTurn({
        hasPendingTurn: session.pendingTurn !== undefined,
        lastAssistant: last,
      })
    ) {
      return null;
    }

    const pendingTurn = {
      prompt: args.prompt,
      requestedAt: Date.now(),
      ...(openTurn ? { turnId: openTurn._id } : {}),
      attachmentStorageIds: args.attachmentStorageIds,
      ...(args.model !== undefined
        ? { model: normalizeAIModel(args.model) }
        : {}),
      interactionMode: "default" as const,
    };
    await ctx.db.patch(args.sessionId, {
      pendingTurn,
      updatedAt: Date.now(),
    });
    await syncSessionDaemonState(ctx, session, { pendingTurn });
    console.log(
      `[sessionWorkflow] ensurePendingTurn restaged sessionId=${args.sessionId}`,
    );
    return null;
  },
});

/**
 * Ops/recovery: rebuild and stage pendingTurn for a session stuck on an open
 * assistant placeholder (daemon polling empty after a cancel race).
 */
export const restageOpenTurn = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.object({ restaged: v.literal(true) }),
    v.object({ restaged: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session)
      return { restaged: false as const, reason: "session not found" };
    if (session.pendingTurn)
      return { restaged: false as const, reason: "pendingTurn already set" };

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .order("desc")
      .take(5);
    const lastAssistant = messages.find((m) => m.role === "assistant");
    // Stricter than the in-workflow re-stage: this path rebuilds the prompt from
    // the user message, so a bubble that already streamed text would replay it.
    if (
      lastAssistant === undefined ||
      !isUnclaimedOpenTurn({
        hasPendingTurn: session.pendingTurn !== undefined,
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
    // Daemon-pull recovery only — one-shot providers push via launch.
    if (!usesChatDaemon(session.lastModel)) {
      return {
        restaged: false as const,
        reason: "not a daemon-pull session",
      };
    }
    const user = await ctx.db.get(session.userId);
    const { prompt } = await buildSessionPrompt(ctx, {
      session,
      repo,
      user,
      message: lastUser.content,
      model: session.lastModel ?? lastUser.model ?? DEFAULT_AI_MODEL,
    });

    const openTurn = await findOpenSessionTurn(ctx, args.sessionId);
    const pendingTurn = {
      prompt,
      requestedAt: Date.now(),
      ...(openTurn ? { turnId: openTurn._id } : {}),
      attachmentStorageIds: lastUser.attachmentStorageIds,
      ...(session.lastModel !== undefined ? { model: session.lastModel } : {}),
      interactionMode: "default" as const,
    };
    await ctx.db.patch(args.sessionId, {
      pendingTurn,
      updatedAt: Date.now(),
    });
    await syncSessionDaemonState(ctx, session, { pendingTurn });
    console.log(
      `[sessionWorkflow] restageOpenTurn sessionId=${args.sessionId}`,
    );
    return { restaged: true as const };
  },
});

/**
 * Daemon-minted continuation turn. Inserts an assistant placeholder and arms a
 * stale handler so a crashed daemon cannot leave an empty bubble forever.
 */
export const openSyntheticTurn = authMutation({
  args: {
    sessionId: v.id("sessions"),
    // The daemon's own model. Optional only for daemons launched before the
    // field existed; those fall back to `session.lastModel`, which the picker
    // can move mid-flight and may therefore mis-attribute the checkpoint.
    model: v.optional(aiModelValidator),
  },
  returns: v.object({
    messageId: v.id("messages"),
    turnId: v.id("turns"),
    leaseGeneration: v.number(),
  }),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const turnModel = normalizeAIModel(args.model ?? session.lastModel);
    const messageId = await ctx.db.insert("messages", {
      parentId: args.sessionId,
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
    const turnId = await openSessionTurn(ctx, {
      sessionId: args.sessionId,
      streamingEntityId: String(args.sessionId),
      placeholderMessageId: messageId,
      prompt: "[synthetic continuation]",
      model: turnModel,
      sandboxId: session.sandboxId,
      repoId: session.repoId,
    });
    const turn = await ctx.db.get(turnId);
    if (!turn) throw new Error("Synthetic turn was not created");
    const lease = await acquireTurnLease(ctx, turn, "running");
    if (!lease) throw new Error("Synthetic turn lease was not acquired");
    await ctx.db.patch(args.sessionId, {
      syntheticTurnMessageId: messageId,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.sessionWorkflow.handleStaleSyntheticTurn,
      { sessionId: args.sessionId, messageId },
    );
    return { messageId, ...lease };
  },
});

/** Finalizes a synthetic continuation turn by messageId (never recency). */
export const completeSyntheticTurn = authMutation({
  args: {
    sessionId: v.id("sessions"),
    messageId: v.id("messages"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    pendingQuestion: v.optional(v.string()),
    turnId: v.optional(v.string()),
    leaseGeneration: v.optional(v.number()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turnResolution = await resolveCompletionTurn(ctx, {
      sessionId: args.sessionId,
      turnId: args.turnId,
      leaseGeneration: args.leaseGeneration,
      placeholderMessageId: args.messageId,
    });
    if (turnResolution.status === "stale") return null;
    if (turnResolution.status === "current") {
      await advanceTurn(ctx, turnResolution.turn, "finalizing");
    }
    await clearStreamingActivity(ctx, String(args.sessionId));

    const message = await ctx.db.get(args.messageId);
    if (
      !message ||
      message.parentId !== args.sessionId ||
      message.finishedAt !== undefined
    ) {
      await ctx.db.patch(args.sessionId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      if (turnResolution.status === "current") {
        await closeTurn(ctx, turnResolution.turn, "error", {
          error: "Synthetic turn placeholder was no longer available",
        });
      }
      await startNextQueuedSessionMessage(ctx, args.sessionId);
      return null;
    }

    const patch: {
      content: string;
      activityLog?: string;
      finishedAt: number;
      pendingQuestion?: string;
      model?: Doc<"messages">["model"];
      beforeSha?: string;
      afterSha?: string;
    } = {
      content: args.success
        ? args.result || "I couldn't process your message."
        : `Error: ${args.error || "Unknown error during execution."}`,
      finishedAt: Date.now(),
    };
    if (args.activityLog) {
      patch.activityLog = args.activityLog;
    }
    if (args.pendingQuestion) {
      patch.pendingQuestion = args.pendingQuestion;
    }
    if (args.beforeSha !== undefined && args.afterSha !== undefined) {
      patch.beforeSha = args.beforeSha;
      patch.afterSha = args.afterSha;
    }
    // Drops the open-time stamp so a failed turn never becomes a checkpoint.
    if (!args.success) {
      patch.model = undefined;
    }
    await ctx.db.patch(args.messageId, patch);

    await ctx.db.patch(args.sessionId, {
      syntheticTurnMessageId: undefined,
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
    await startNextQueuedSessionMessage(ctx, args.sessionId);
    return null;
  },
});

/** Crash hygiene for daemon-minted continuations left open after daemon death. */
export const handleStaleSyntheticTurn = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.syntheticTurnMessageId !== args.messageId) {
      return null;
    }

    const message = await ctx.db.get(args.messageId);
    if (!message || message.finishedAt !== undefined) {
      await ctx.db.patch(args.sessionId, {
        syntheticTurnMessageId: undefined,
        updatedAt: Date.now(),
      });
      return null;
    }

    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", String(args.sessionId)))
      .first();
    const streamingStale =
      streaming === null ||
      Date.now() - (streaming.lastUpdatedAt ?? 0) > 2 * 60 * 1000;
    if (!streamingStale) {
      // Still live — re-arm so a later daemon death is still cleaned up.
      await ctx.scheduler.runAfter(
        10 * 60 * 1000,
        internal.sessionWorkflow.handleStaleSyntheticTurn,
        { sessionId: args.sessionId, messageId: args.messageId },
      );
      return null;
    }

    await finalizeCancelledAssistantMessage(ctx, message, streaming);
    const openTurn = await findOpenSessionTurn(ctx, args.sessionId);
    if (openTurn?.placeholderMessageId === args.messageId) {
      await closeTurn(ctx, openTurn, "error", {
        error: "Synthetic turn stopped reporting activity",
      });
    }
    await clearStreamingActivity(ctx, String(args.sessionId));
    await ctx.db.patch(args.sessionId, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    await startNextQueuedSessionMessage(ctx, args.sessionId);
    return null;
  },
});

/** Receives sandbox completion callback and forwards the event to the active session workflow. */
export const handleCompletion = authMutation({
  args: {
    sessionId: v.id("sessions"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    pendingQuestion: v.optional(v.string()),
    turnId: v.optional(v.string()),
    leaseGeneration: v.optional(v.number()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const completionStartedAt = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (!session || !session.activeWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId)))
      throw new Error("Not authorized");

    const turnResolution = await resolveCompletionTurn(ctx, {
      sessionId: args.sessionId,
      turnId: args.turnId,
      leaseGeneration: args.leaseGeneration,
    });
    if (turnResolution.status === "stale") return null;
    if (turnResolution.status === "current") {
      await advanceTurn(ctx, turnResolution.turn, "finalizing");
    }

    console.log(
      `[sessionWorkflow] handleCompletion received sessionId=${args.sessionId} success=${args.success} workflowId=${session.activeWorkflowId}`,
    );

    // One-shot providers never claimPendingTurn, so clear any leftover staged
    // prompt here. Persistent chat daemons already cleared it on claim.
    if (session.pendingTurn !== undefined) {
      await ctx.db.patch(args.sessionId, { pendingTurn: undefined });
      await syncSessionDaemonState(ctx, session, { pendingTurn: undefined });
    }

    await sendCompletionEvent(
      ctx,
      sessionCompleteEvent,
      session.activeWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
        pendingQuestion: args.pendingQuestion,
        beforeSha: args.beforeSha,
        afterSha: args.afterSha,
      },
    );

    await recordCompletionLog(ctx, {
      entityType: "session",
      entityId: String(args.sessionId),
      entityTitle: session.title,
      repoId: session.repoId,
      rawResultEvent: args.rawResultEvent,
    });

    console.log(
      `[sessionWorkflow] handleCompletion finished in ${Date.now() - completionStartedAt}ms sessionId=${args.sessionId}`,
    );

    return null;
  },
});
