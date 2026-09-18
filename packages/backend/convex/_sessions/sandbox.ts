import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authMutation, getSessionWithAccess } from "../functions";
import { workflow } from "../workflowManager";
import { resolveSessionBaseBranch } from "./baseBranch";
import {
  seedSandboxStartupActivity,
  clearSandboxStartupActivity,
} from "../_sandbox/startupActivity";
import { markAllRunningExited } from "../backgroundProcesses";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { finalizeCancelledAssistantMessage } from "../streaming";
import { clearPendingQuestionsForEntity } from "../pendingQuestions";
import { startNextQueuedSessionMessageAfterSandboxReady } from "../_queues/helpers";
import { settleOrphanedBackgroundAgents } from "./backgroundAgents";
import { syncSessionDaemonState } from "./daemonState";
import { STUCK_STOPPING_RECOVER_MS } from "../_sandbox/stopRecovery";
import { isEvaOwnedBranch } from "../_sandbox_runtime/divergedPublish";

/** Longest `sandboxError` we persist — it is read as one line of chat header copy. */
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

/** Updates sandbox-related fields (sandbox ID, branch, PR URL) on a session. */
export const updateSandbox = authMutation({
  args: {
    id: v.id("sessions"),
    sandboxId: v.optional(v.string()),
    branchName: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    const updates: {
      sandboxId?: string;
      branchName?: string;
      prUrl?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.sandboxId !== undefined) updates.sandboxId = args.sandboxId;
    if (args.branchName !== undefined) updates.branchName = args.branchName;
    if (args.prUrl !== undefined) updates.prUrl = args.prUrl;
    await ctx.db.patch(args.id, updates);
    return null;
  },
});

/** Clears the sandbox association and marks the session as closed. */
export const clearSandbox = authMutation({
  args: { id: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    await markAllRunningExited(ctx.db, args.id);
    await ctx.db.patch(args.id, {
      sandboxId: undefined,
      // The association is being reset, so a previous wake failure no longer
      // describes anything the user can act on.
      sandboxError: undefined,
      status: "closed",
    });
    return null;
  },
});

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
    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");
    const branchName = session.branchName || `eva/session-${args.sessionId}`;
    const baseBranch = resolveSessionBaseBranch(session, repo);
    await ctx.db.patch(args.sessionId, {
      status: "starting",
      // A new attempt owns the outcome: drop the previous failure so the dot
      // leaves "Couldn't wake up" the moment Try again is pressed.
      sandboxError: undefined,
      updatedAt: Date.now(),
    });
    // Seed startup streaming immediately so the UI shows a real step instead of
    // the random "Eva is inferring…" spinner while the workflow schedules.
    await seedSandboxStartupActivity(
      ctx.db,
      `session-startup-${args.sessionId}`,
    );
    const reusableSandboxId = session.sandboxId;
    console.log(
      `[sessions] startSandbox sessionId=${args.sessionId} existingSandboxId=${session.sandboxId ?? "none"} sandboxId=${reusableSandboxId ?? "none"}`,
    );
    const startArgs = {
      sessionId: args.sessionId,
      existingSandboxId: session.sandboxId,
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      baseBranch,
      repoId: session.repoId,
    };
    // Vercel: schedule the start action directly. Workflow step scheduling was
    // measured at ~6s before the first action ran.
    if (reusableSandboxId) {
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
    return null;
  },
});

/**
 * User-confirmed recovery for the rewritten-branch publish refusal: replaces
 * origin/<branch> with the sandbox's local branch. Fire-and-forget — the
 * scheduled action posts the outcome into the session chat as a system alert.
 */
export const forcePushBranch = authMutation({
  args: { sessionId: v.id("sessions") },
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
    if (!session.branchName) {
      throw new Error("Session has no branch to publish");
    }
    // Only eva-owned session branches may ever be rewritten on GitHub; a base
    // branch must never be reachable through this path.
    if (!isEvaOwnedBranch(session.branchName)) {
      throw new Error(
        `Refusing to force-push non-session branch ${session.branchName}`,
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
      branchName: session.branchName,
    });
    return null;
  },
});

/**
 * Shared stop path for the user Stop button and PR-terminal webhook auto-stop.
 * Marks the session `"stopping"` then schedules provider teardown.
 */
export async function requestSessionSandboxStop(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session) return;

  // Stopping kills the paused turn, so any blocking AskUserQuestion can never
  // be claimed — clear it or it hides the composer forever.
  await clearPendingQuestionsForEntity(ctx.db, String(sessionId));

  // Allow stop from closed when a sandboxId remains — start can early-ready
  // then fail and leave a live Vercel VM while UI shows inactive.
  if (session.status === "stopping") {
    // Already stopping — but a previous finalize may have stalled (e.g. its
    // action was killed while a racing resume held the VM). Re-issue the
    // idempotent finalize so clicking Stop again recovers a stuck `stopping`
    // row instead of being a no-op that leaves it wedged forever.
    if (session.sandboxId) {
      await scheduleFinalizeStop(ctx, {
        sessionId,
        sandboxId: session.sandboxId,
        repoId: session.repoId,
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
    });
  } else {
    // No sandbox to stop — close immediately.
    await ctx.db.patch(sessionId, {
      ptySessionId: undefined,
      status: "closed",
      updatedAt: Date.now(),
    });
    return;
  }

  // Clear leftover start steps so the chat does not re-show "Starting
  // sandbox..." / cold-storage copy while status is stopping.
  await clearSandboxStartupActivity(ctx.db, `session-startup-${sessionId}`);

  if (session.syntheticTurnMessageId) {
    const syntheticMessage = await ctx.db.get(session.syntheticTurnMessageId);
    if (syntheticMessage && syntheticMessage.finishedAt === undefined) {
      const streaming = await ctx.db
        .query("streamingActivity")
        .withIndex("by_entity", (q) => q.eq("entityId", String(sessionId)))
        .first();
      await finalizeCancelledAssistantMessage(ctx, syntheticMessage, streaming);
    }
    await clearStreamingActivity(ctx, String(sessionId));
  }

  // The "Sandbox stopped" / "Failed to stop sandbox" divider is inserted by
  // `markSandboxClosed` once the sandbox's stop call settles, so the divider
  // matches the actual outcome rather than being optimistic.
  await ctx.db.patch(sessionId, {
    // Keep sandboxId so we can resume the stopped sandbox later.
    ptySessionId: undefined,
    status: "stopping",
    syntheticTurnMessageId: undefined,
    updatedAt: Date.now(),
  });
}

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
  },
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal._sessions.sandbox.finalizeStopSandbox,
    args,
  );
  // Actions are not auto-retried. A Convex "Transient error while executing
  // action" (0ms) leaves status stuck on "stopping" forever — re-issue once.
  await ctx.scheduler.runAfter(
    STUCK_STOPPING_RECOVER_MS,
    internal._sessions.sandbox.recoverStuckStopping,
    { sessionId: args.sessionId },
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
      stopError = err instanceof Error ? err.message : String(err);
    }
    await ctx.runMutation(internal._sessions.sandbox.markSandboxClosed, {
      sessionId: args.sessionId,
      error: stopError,
    });
    return null;
  },
});

/**
 * Re-issues finalizeStopSandbox if the session is still `"stopping"`.
 * Scheduled after Stop so a platform transient on the first action doesn't
 * leave the UI wedged; no-ops if stop already finished.
 */
export const recoverStuckStopping = internalMutation({
  args: { sessionId: v.id("sessions") },
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    // Only flip if still stopping — don't overwrite a fresh start.
    if (session.status !== "stopping") return null;
    if (args.error) {
      await ctx.db.insert("messages", {
        parentId: args.sessionId,
        role: "assistant",
        content: "Failed to stop sandbox",
        timestamp: Date.now(),
        isSystemAlert: true,
        errorDetail: args.error,
      });
      // VM is still running — keep UI active so Stop can be retried.
      await ctx.db.patch(args.sessionId, {
        status: "active",
        sandboxError: undefined,
        updatedAt: Date.now(),
      });
      return null;
    }
    await ctx.db.insert("messages", {
      parentId: args.sessionId,
      role: "assistant",
      content: "Sandbox stopped",
      timestamp: Date.now(),
      isSystemAlert: true,
    });
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
    // Set only by early-ready on a new snapshot-restored session: gate the
    // queued first turn until the base pull + dependency install finish. Final-
    // ready never passes it (setup has by then cleared the flag explicitly).
    markSetupPending: v.optional(v.boolean()),
    // Set by every early-ready call: services (background + startup commands)
    // are still coming up, so the Preview heal must not launch them itself.
    // Final-ready omits it, which clears the flag.
    markServicesPending: v.optional(v.boolean()),
    /** Existing sandbox id was unresumable; we created a fresh one. */
    resumeFellBack: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    // User may have clicked Stop while start/resume was still running. Never
    // flip closed/stopping back to active — that left Vercel running with UI
    // showing stopped, or re-activated after stop confirmation.
    if (session.status === "stopping" || session.status === "closed") {
      console.log(
        `[sessions] sandboxReady ignored sessionId=${args.sessionId} status=${session.status} sandboxId=${args.sandboxId}`,
      );
      return null;
    }
    // Early-ready (right after Sandbox.create) + final-ready (after services)
    // both call this. Only emit the system alert once; still patch latest
    // sandbox/dev metadata on every call.
    const alreadyActive =
      session.status === "active" && session.sandboxId === args.sandboxId;
    if (!alreadyActive) {
      // Fresh boot / resume — prior VM processes are gone.
      await markAllRunningExited(ctx.db, args.sessionId);
      // Subagents died with the old VM, so settle any the dead daemon never
      // reported terminal — they gate the message queue (see
      // `runningBackgroundAgents`) and nothing else would ever clear them.
      const settledAgents = settleOrphanedBackgroundAgents(
        session.backgroundAgents,
        Date.now(),
      );
      if (settledAgents) {
        await ctx.db.patch(args.sessionId, {
          backgroundAgents: settledAgents,
        });
      }
      const content = args.resumeFellBack
        ? "Previous sandbox expired — started a fresh one. Uncommitted changes from the old sandbox are gone."
        : args.isNew
          ? "Sandbox started"
          : "Sandbox reconnected";
      await ctx.db.insert("messages", {
        parentId: args.sessionId,
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
      // Awake: whatever the last attempt failed on is history.
      sandboxError: undefined,
      ...(args.devPort !== undefined ? { devPort: args.devPort } : {}),
      ...(args.devCommand !== undefined ? { devCommand: args.devCommand } : {}),
      ...(args.markSetupPending ? { sandboxSetupPending: true } : {}),
      // Early-ready arms the Preview-heal gate; final-ready (which never passes
      // the flag) always disarms it, so a heal can resume as soon as the
      // lifecycle has launched services itself.
      sandboxServicesPending: args.markServicesPending ? true : undefined,
    });
    if (args.markSetupPending) {
      await syncSessionDaemonState(ctx, session, {
        sandboxSetupPending: true,
      });
    }
    // Drain first-message (and any other) queued turns now that chat can run.
    // Early + final ready both call this; second no-ops while activeWorkflowId is set.
    // Starting a sandbox is not a turn ending, so this drain must not wake a
    // watching orchestrator when the queue turns out to be empty.
    await startNextQueuedSessionMessageAfterSandboxReady(ctx, args.sessionId);
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
    await syncSessionDaemonState(ctx, session, {
      sandboxSetupPending: undefined,
    });
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    await markAllRunningExited(ctx.db, args.sessionId);
    await ctx.db.insert("messages", {
      parentId: args.sessionId,
      role: "assistant",
      content: "Failed to start sandbox",
      timestamp: Date.now(),
      isSystemAlert: true,
      errorDetail: args.error,
    });
    await ctx.db.patch(args.sessionId, {
      status: "closed",
      // Read by the sidebar dot and the chat header's retry notice — a start
      // that fails is otherwise indistinguishable from a sleeping sandbox.
      sandboxError: toUserFacingSandboxError(args.error),
      updatedAt: Date.now(),
    });
    // A watched child whose sandbox never started will never reach the
    // queue-drain hook (its queued first turn stays queued), so without this
    // the orchestrator waits on it forever. Notify only — deliberately no
    // drain, which would start that turn on a session just marked closed.
    if (session.watchedByOrchestrator !== undefined) {
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
    // The copy says the session is still running. A stop that raced startup
    // used to insert this row minutes later against a closed chat (session 125).
    if (session.status !== "active") return null;
    // Step labels are prefixed onto the error by runLoggedSessionStep, so the
    // message can name what actually broke instead of a generic "unfinished".
    // Branch-checkout failures are recoverable (publish self-heals the branch),
    // which the generic copy misrepresents as a services problem.
    const isBranchCheckoutFailure =
      /\.(checkoutSessionBranch|checkoutBranch):/.test(args.error);
    await ctx.db.insert("messages", {
      parentId: args.sessionId,
      role: "assistant",
      content: isBranchCheckoutFailure
        ? "Session branch could not be created — the session is running on its base branch. Eva will recover the branch when it publishes your changes."
        : "Sandbox startup unfinished — session left running. Some services may still be starting.",
      timestamp: Date.now(),
      isSystemAlert: true,
      errorDetail: args.error,
    });
    return null;
  },
});
