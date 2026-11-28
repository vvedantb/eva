import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  authMutation,
  getSessionWithAccess,
} from "../functions";
import { workflow } from "../workflowManager";
import { resolveSessionBaseBranch } from "./baseBranch";
import {
  seedSandboxStartupActivity,
  clearSandboxStartupActivity,
} from "../_sandbox/startupActivity";
import { markAllRunningExited } from "../backgroundProcesses";
import {
  clearStreamingActivity,
  finalizeCancelledAssistantMessage,
} from "../streaming";
import { detachPendingQuestions } from "../pendingQuestions";
import { clearPreviewToolCallsForParent } from "../_previewToolCalls/calls";
import { settleOrphanedBackgroundAgents } from "./backgroundAgents";
import {
  ensureMainChat,
  findMainChat,
  sessionChatStreamingEntityId,
} from "../_sessionChats/helpers";
import {
  scheduleDrainAfterStopSettles,
  STUCK_STOPPING_RECOVER_MS,
} from "../_sandbox/stopRecovery";
import {
  stopAlertText,
  stopPostsDivider,
  stopReasonValidator,
  type StopReason,
} from "../_sandbox/stopReason";
import { touchUserActivity } from "../_sandbox/activity";
import { sandboxStartupEntityId } from "@eva/shared";
import {
  canRequestSandboxStart,
  discardUntrackedSandbox,
  isCurrentSandboxStartAttempt,
  nextSandboxStartAttempt,
  scheduleStuckStartExpiry,
  shouldApplySandboxStartFailure,
} from "../_sandbox/transitions";
import { isEvaOwnedBranch } from "../_sandbox_runtime/divergedPublish";
import { buildSessionBranchName } from "../_git/branchNames";
import { errorMessage } from "@vvedantb/server";
import { sessionOwnerTaskId } from "./owner";
import {
  isPreviewSandboxAllowed,
  previewSandboxNotAllowedError,
} from "../_agentTasks/previewGate";

const SANDBOX_ERROR_MAX_LENGTH = 200;

/**
 * Turns a thrown start error into the short line the UI shows next to
 * "Eva couldn't wake up". Action errors arrive with a Convex prefix, a request
 * id, and a stack — none of which mean anything to the person reading them, and
 * all of which would blow past the 200-char budget.
 */
export function toUserFacingSandboxError(raw: string): string {
  const cleaned = (raw.split("\n")[0] ?? "")
    .replace(/\[Request ID:[^\]]*\]/g, "")
    .replace(/\[CONVEX[^\]]*\]/g, "")
    .replace(/^(Uncaught\s+)?[A-Za-z]*Error:\s*/, "")
    .replace(/\s+at\s+\S+\s*\(.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "The sandbox did not start.";
  return cleaned.length > SANDBOX_ERROR_MAX_LENGTH
    ? `${cleaned.slice(0, SANDBOX_ERROR_MAX_LENGTH - 1).trimEnd()}…`
    : cleaned;
}

/** Starts or restarts a sandbox for a session by launching the startup workflow. */
export const startSandbox = authMutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    const blocked = await previewBlockedError(ctx.db, session);
    if (blocked) throw blocked;
    await requestSessionSandboxStart(ctx, session);
    return null;
  },
});

async function previewBlockedError(
  db: DatabaseReader,
  session: Doc<"sessions">,
): Promise<Error | null> {
  if (session.sandboxId !== undefined) return null;
  const taskId = sessionOwnerTaskId(session);
  const task = taskId ? await db.get(taskId) : null;
  if (!task || (await isPreviewSandboxAllowed(db, task))) return null;
  return previewSandboxNotAllowedError(task);
}

/**
 * Shared start path for the user Start button, the chat queue's wake and the
 * fork's source restart. Marks the session `"starting"` then schedules resume
 * or create.
 */
export async function requestSessionSandboxStart(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  if (await previewBlockedError(ctx.db, session)) {
    console.log(
      `[sessions] startSandbox skipped sessionId=${session._id}: its owner cannot preview yet`,
    );
    return;
  }
  if (!canRequestSandboxStart(session.status)) {
    console.log(
      `[sessions] startSandbox skipped sessionId=${session._id} status=${session.status}`,
    );
    return;
  }
  const repo = await ctx.db.get(session.repoId);
  if (!repo) throw new Error("Repository not found");
  const branchName = session.branchName || buildSessionBranchName(session._id);
  const baseBranch = resolveSessionBaseBranch(session, repo);
  const startAttempt = nextSandboxStartAttempt(session.sandboxStartAttempt);
  await ctx.db.patch(session._id, {
    status: "starting",
    sandboxStartAttempt: startAttempt,
    sandboxError: undefined,
    updatedAt: Date.now(),
  });
  await seedSandboxStartupActivity(
    ctx.db,
    sandboxStartupEntityId({ kind: "session", sessionId: session._id }),
  );
  const reusableSandboxId = session.sandboxId;
  console.log(
    `[sessions] startSandbox sessionId=${session._id} existingSandboxId=${session.sandboxId ?? "none"} sandboxId=${reusableSandboxId ?? "none"}`,
  );
  const startArgs = {
    sessionId: session._id,
    existingSandboxId: session.sandboxId,
    installationId: repo.installationId,
    repoOwner: repo.owner,
    repoName: repo.name,
    branchName,
    baseBranch,
    repoId: session.repoId,
    hasLinkedRepos: (session.linkedRepoCount ?? 0) > 0,
    startAttempt,
  };
  await scheduleStuckStartExpiry(ctx, session._id, startAttempt);
  if (reusableSandboxId && !startArgs.hasLinkedRepos) {
    await ctx.scheduler.runAfter(
      0,
      internal.sandbox.startSessionSandbox,
      startArgs,
    );
  } else {
    await workflow.start(
      ctx,
      internal.sessionWorkflow.sessionSandboxStartupWorkflow,
      startArgs,
    );
  }
}

/**
 * User-confirmed recovery for the rewritten-branch publish refusal: replaces
 * origin/<branch> with the sandbox's local branch. Fire-and-forget — the
 * scheduled action posts the outcome into the session chat as a system alert.
 *
 * `sessionRepoId` selects one of a multi-repo session's linked clones instead
 * of the primary — the recovery banner renders one row per diverged repo, and
 * each row recovers only its own branch.
 */
export const forcePushBranch = authMutation({
  args: {
    sessionId: v.id("sessions"),
    sessionRepoId: v.optional(v.id("sessionRepos")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    if (session.status !== "active" || !session.sandboxId) {
      throw new Error("Start the sandbox before force-pushing");
    }
    let linkedRepo: Doc<"sessionRepos"> | null = null;
    if (args.sessionRepoId !== undefined) {
      linkedRepo = await ctx.db.get(args.sessionRepoId);
      if (!linkedRepo || linkedRepo.sessionId !== args.sessionId) {
        throw new Error("Linked repository not found for this session");
      }
    }
    const branchName = linkedRepo ? linkedRepo.branchName : session.branchName;
    if (!branchName) {
      throw new Error("Session has no branch to publish");
    }
    if (!isEvaOwnedBranch(branchName)) {
      throw new Error(
        `Refusing to force-push non-session branch ${branchName}`,
      );
    }
    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");
    await ctx.scheduler.runAfter(0, internal.sandbox.performForcePushBranch, {
      sessionId: args.sessionId,
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      ...(args.sessionRepoId !== undefined
        ? { sessionRepoId: args.sessionRepoId }
        : {}),
    });
    return null;
  },
});

/** Records the dev server a manual rerun resolved (`runDevServerInSandbox`). */
export const patchSessionDevServer = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    devPort: v.number(),
    devCommand: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      devPort: args.devPort,
      devCommand: args.devCommand,
    });
    return null;
  },
});

/**
 * Shared stop path for the Stop button (`stopWorkSandbox`), archive and the
 * PR-terminal webhook auto-stop.
 * Marks the session `"stopping"` then schedules provider teardown.
 */
export async function requestSessionSandboxStop(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  options: { stopReason?: StopReason } = {},
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session) return;
  const { stopReason } = options;

  const chat = await findMainChat(ctx.db, sessionId);
  if (chat) {
    await detachPendingQuestions(
      ctx.db,
      sessionChatStreamingEntityId(chat._id),
    );
    await clearPreviewToolCallsForParent(ctx.db, chat._id);
  }

  if (session.status === "stopping") {
    if (session.sandboxId) {
      await scheduleFinalizeStop(ctx, {
        sessionId,
        sandboxId: session.sandboxId,
        repoId: session.repoId,
        stopReason,
      });
    } else {
      await ctx.db.patch(sessionId, {
        status: "closed",
        updatedAt: Date.now(),
      });
    }
    return;
  }

  if (session.sandboxId) {
    await scheduleFinalizeStop(ctx, {
      sessionId,
      sandboxId: session.sandboxId,
      repoId: session.repoId,
      stopReason,
    });
  } else {
    await ctx.db.patch(sessionId, {
      ptySessionId: undefined,
      status: "closed",
      updatedAt: Date.now(),
    });
    return;
  }

  await clearSandboxStartupActivity(
    ctx.db,
    sandboxStartupEntityId({ kind: "session", sessionId }),
  );

  if (chat?.syntheticTurnMessageId) {
    const streamingEntityId = sessionChatStreamingEntityId(chat._id);
    const syntheticMessage = await ctx.db.get(chat.syntheticTurnMessageId);
    if (syntheticMessage && syntheticMessage.finishedAt === undefined) {
      const streaming = await ctx.db
        .query("streamingActivity")
        .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
        .first();
      await finalizeCancelledAssistantMessage(ctx, syntheticMessage, streaming);
    }
    await clearStreamingActivity(ctx, streamingEntityId);
    await ctx.db.patch(chat._id, { syntheticTurnMessageId: undefined });
  }

  await ctx.db.patch(sessionId, {
    ptySessionId: undefined,
    status: "stopping",
    syntheticTurnMessageId: undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Archive teardown: stops the sandbox even mid-turn. The Stop button is
 * `stopWorkSandbox` (`_sessions/stop.ts`), which refuses while an agent works.
 */
export const stopSandbox = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.sessionId, ctx.userId);
    await requestSessionSandboxStop(ctx, args.sessionId);
    return null;
  },
});

/** Internal stop used by PR merge/close webhooks (no user auth context). */
export const requestStopSandbox = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requestSessionSandboxStop(ctx, args.sessionId);
    return null;
  },
});

/**
 * Schedules session teardown. Every path that flips a session to `"stopping"`
 * must go through here, or a transient on the finalize action wedges that path
 * with no recovery.
 */
export async function scheduleFinalizeStop(
  ctx: MutationCtx,
  args: {
    sessionId: Id<"sessions">;
    sandboxId: string;
    repoId: Id<"githubRepos">;
    stopReason?: StopReason;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal._sessions.sandbox.finalizeStopSandbox,
    args,
  );
  await ctx.scheduler.runAfter(
    STUCK_STOPPING_RECOVER_MS,
    internal._sessions.sandbox.recoverStuckStopping,
    { sessionId: args.sessionId, stopReason: args.stopReason },
  );
}

/**
 * Awaits provider stop and finalizes session status. Only marks `"closed"`
 * after a successful stop — on failure reverts to `"active"` so the UI matches
 * a still-running Vercel VM and the user can retry Stop.
 */
export const finalizeStopSandbox = internalAction({
  args: {
    sessionId: v.id("sessions"),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    stopReason: stopReasonValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let stopError: string | undefined;
    try {
      await ctx.runAction(internal.sandbox.stopSandbox, {
        sandboxId: args.sandboxId,
        repoId: args.repoId,
      });
    } catch (err) {
      stopError = errorMessage(err);
    }
    await ctx.runMutation(internal._sessions.sandbox.markSandboxClosed, {
      sessionId: args.sessionId,
      error: stopError,
      stopReason: args.stopReason,
    });
    return null;
  },
});

/**
 * Re-issues finalizeStopSandbox if the session is still `"stopping"`.
 * Scheduled after Stop so a platform transient on the first action doesn't
 * leave the UI wedged; no-ops if stop already finished. Carries the original
 * stop reason so the divider matches the request even when this finalize wins
 * the race against a slow provider stop.
 */
export const recoverStuckStopping = internalMutation({
  args: { sessionId: v.id("sessions"), stopReason: stopReasonValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "stopping" || !session.sandboxId) {
      return null;
    }
    await ctx.scheduler.runAfter(
      0,
      internal._sessions.sandbox.finalizeStopSandbox,
      {
        sessionId: args.sessionId,
        sandboxId: session.sandboxId,
        repoId: session.repoId,
        stopReason: args.stopReason,
      },
    );
    return null;
  },
});

/**
 * Internal: after stop settles, either close the session (success) or revert
 * to active (failure) so Eva never shows "off" while Vercel is still running.
 */
export const markSandboxClosed = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    error: v.optional(v.string()),
    stopReason: stopReasonValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (session.status !== "stopping") return null;
    await scheduleDrainAfterStopSettles(ctx, args.sessionId);
    const mainChat = await ensureMainChat(ctx, session);
    if (args.error) {
      await ctx.db.insert("messages", {
        parentId: mainChat._id,
        role: "assistant",
        content: "Failed to stop sandbox",
        timestamp: Date.now(),
        isSystemAlert: true,
        errorDetail: args.error,
      });
      await ctx.db.patch(args.sessionId, {
        status: "active",
        sandboxError: undefined,
        updatedAt: Date.now(),
      });
      return null;
    }
    if (stopPostsDivider(args.stopReason)) {
      await ctx.db.insert("messages", {
        parentId: mainChat._id,
        role: "assistant",
        content: stopAlertText(args.stopReason),
        timestamp: Date.now(),
        isSystemAlert: true,
      });
    }
    await markAllRunningExited(ctx.db, args.sessionId);
    await ctx.db.patch(args.sessionId, {
      status: "closed",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Marks a session sandbox as ready, updating its status to active (internal use). */
export const sandboxReady = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    sandboxId: v.string(),

    branchName: v.string(),
    isNew: v.boolean(),
    usedSnapshot: v.optional(v.boolean()),
    devPort: v.optional(v.number()),
    devCommand: v.optional(v.string()),
    markSetupPending: v.optional(v.boolean()),
    markServicesPending: v.optional(v.boolean()),
    resumeFellBack: v.optional(v.boolean()),
    startAttempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (
      !isCurrentSandboxStartAttempt(
        session.sandboxStartAttempt,
        args.startAttempt,
      )
    ) {
      console.log(
        `[sessions] sandboxReady ignored stale attempt ${args.startAttempt} (current ${session.sandboxStartAttempt}) sessionId=${args.sessionId}`,
      );
      await discardUntrackedSandbox(ctx, {
        sandboxId: args.sandboxId,
        trackedSandboxId: session.sandboxId,
        repoId: session.repoId,
        isNew: args.isNew,
      });
      return null;
    }
    if (session.status === "stopping" || session.status === "closed") {
      console.log(
        `[sessions] sandboxReady ignored sessionId=${args.sessionId} status=${session.status} sandboxId=${args.sandboxId}`,
      );
      if (args.startAttempt !== undefined) {
        await discardUntrackedSandbox(ctx, {
          sandboxId: args.sandboxId,
          trackedSandboxId: session.sandboxId,
          repoId: session.repoId,
          isNew: args.isNew,
        });
      }
      return null;
    }
    const alreadyActive =
      session.status === "active" && session.sandboxId === args.sandboxId;
    const mainChat = await ensureMainChat(ctx, session);
    if (!alreadyActive) {
      await markAllRunningExited(ctx.db, args.sessionId);
      const settledAgents = settleOrphanedBackgroundAgents(
        mainChat.backgroundAgents,
        Date.now(),
      );
      if (settledAgents) {
        await ctx.db.patch(mainChat._id, { backgroundAgents: settledAgents });
      }
      const content = args.resumeFellBack
        ? "Previous sandbox expired — started a fresh one. Uncommitted changes from the old sandbox are gone."
        : args.isNew
          ? "Sandbox started"
          : "Sandbox reconnected";
      await ctx.db.insert("messages", {
        parentId: mainChat._id,
        role: "assistant",
        content,
        timestamp: Date.now(),
        isSystemAlert: true,
      });
    }
    await ctx.db.patch(args.sessionId, {
      updatedAt: Date.now(),
      sandboxId: args.sandboxId,
      branchName: args.branchName,
      status: "active",
      sandboxError: undefined,
      ...(args.devPort !== undefined ? { devPort: args.devPort } : {}),
      ...(args.devCommand !== undefined ? { devCommand: args.devCommand } : {}),
      ...(args.markSetupPending ? { sandboxSetupPending: true } : {}),
      sandboxServicesPending: args.markServicesPending ? true : undefined,
    });
    await touchUserActivity(
      ctx,
      { kind: "session", entityId: String(args.sessionId) },
      { source: "start" },
    );
    await ctx.scheduler.runAfter(
      0,
      internal._queues.helpers.drainQueueQuietly,
      {
        parentId: args.sessionId,
      },
    );
    return null;
  },
});

/**
 * Releases the setup gate set by early-ready so a queued first turn can be
 * claimed. Called once the new session's sandbox is on the latest base branch
 * with current dependencies (or when post-ready setup failed, so the turn is
 * never wedged behind a gate that will never clear). Idempotent.
 */
export const clearSandboxSetupPending = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.sandboxSetupPending !== true) return null;
    await ctx.db.patch(args.sessionId, { sandboxSetupPending: undefined });
    return null;
  },
});

/**
 * Releases the Preview-heal gate set by early-ready without a final-ready.
 * Only the start failure path needs this: it deliberately leaves an active
 * sandbox running, and a flag left armed would suppress the background heal on
 * that sandbox forever. Idempotent.
 */
export const clearSandboxServicesPending = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.sandboxServicesPending !== true) return null;
    await ctx.db.patch(args.sessionId, { sandboxServicesPending: undefined });
    return null;
  },
});

/** Records a sandbox startup failure and marks the session as closed (internal use). */
export const sandboxError = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    error: v.string(),
    startAttempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (
      !isCurrentSandboxStartAttempt(
        session.sandboxStartAttempt,
        args.startAttempt,
      )
    ) {
      console.log(
        `[sessions] sandboxError ignored stale attempt ${args.startAttempt} (current ${session.sandboxStartAttempt}) sessionId=${args.sessionId}`,
      );
      return null;
    }
    if (!shouldApplySandboxStartFailure(session.status)) {
      console.log(
        `[sessions] sandboxError ignored sessionId=${args.sessionId} status=${session.status}: ${args.error}`,
      );
      return null;
    }
    await markAllRunningExited(ctx.db, args.sessionId);
    const mainChat = await ensureMainChat(ctx, session);
    await ctx.db.insert("messages", {
      parentId: mainChat._id,
      role: "assistant",
      content: "Failed to start sandbox",
      timestamp: Date.now(),
      isSystemAlert: true,
      errorDetail: args.error,
    });
    await ctx.db.patch(args.sessionId, {
      status: "closed",
      sandboxError: toUserFacingSandboxError(args.error),
      updatedAt: Date.now(),
    });
    if (session.watchedByAve !== undefined) {
      await ctx.scheduler.runAfter(
        0,
        internal.orchestratorNotify.notifyOrchestratorOfChild,
        {
          child: { kind: "session", sessionId: args.sessionId },
          status: "sandbox failed to start",
        },
      );
    }
    return null;
  },
});

/**
 * Non-fatal: a late startup step failed after early-ready already unlocked the
 * session. Keep status active — do not stop/delete the sandbox the user is on.
 */
export const sandboxStartupWarning = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (session.status !== "active") return null;
    const isBranchCheckoutFailure =
      /\.(checkoutSessionBranch|checkoutBranch):/.test(args.error);
    const mainChat = await ensureMainChat(ctx, session);
    await ctx.db.insert("messages", {
      parentId: mainChat._id,
      role: "assistant",
      content: isBranchCheckoutFailure
        ? "Session branch could not be created — the session is running on its base branch. Eva will recover the branch when it publishes your changes."
        : "Sandbox startup unfinished — session left running. Some services may still be starting.",
      timestamp: Date.now(),
      isSystemAlert: true,
      alertTone: "warning",
      errorDetail: args.error,
    });
    return null;
  },
});
