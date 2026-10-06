import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  idleStopAlertText,
  idleStopDecision,
  resolveIdleStopSettings,
} from "./_sandbox/idleStop";
import { requestSessionSandboxStop } from "./_sessions/sandbox";
import { requestTaskSandboxStop } from "./_agentTasks/sandbox";
import { requestProjectSandboxStop } from "./_projects/sandbox";
import { usageLimitHoldFor } from "./_queues/helpers";

/**
 * Idle sandbox sweep.
 *
 * Vercel bills provisioned memory (2 GB per vCPU) for every minute a sandbox
 * runs, whether or not anything happens inside it, and the only things that
 * ever stopped an Eva sandbox were the user, the 24h session cap, and the
 * opt-in daily sweep. A session someone opened and walked away from therefore
 * billed a full day. This cron stops any active sandbox that has had no chat
 * or agent activity for the configured idle time (settings → Sandboxes).
 *
 * It goes through the same stop path as the Stop button for each surface
 * (`requestSessionSandboxStop` / `requestTaskSandboxStop` /
 * `requestProjectSandboxStop`), so the UI flips to "stopping" in the same
 * mutation and to "closed" once the provider confirms — never "active" with a
 * dead VM. Stopping snapshots the filesystem; the next message or Start
 * resumes it.
 */

const MINUTE_MS = 60_000;

type ParentId = Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;

/** Internal: the idle sweep's config, resolved with defaults (on, 60 min). */
export const getSettingsInternal = internalQuery({
  args: {},
  returns: v.object({ enabled: v.boolean(), minutes: v.number() }),
  handler: async (ctx) =>
    resolveIdleStopSettings(await ctx.db.query("appSettings").first()),
});

/**
 * Activity = the newest chat message under the entity (user prompt, assistant
 * reply, or a system alert such as "Sandbox started", which every surface
 * inserts when its sandbox comes up — so a fresh start always gets the full
 * idle window). Busy = the surface-specific "work in flight" flags the caller
 * passes, plus any queued follow-up, which will open a turn as soon as the
 * current one ends — unless a usage limit holds it.
 */
async function decideIdle(
  ctx: MutationCtx,
  args: {
    parentId: ParentId;
    busy: boolean;
    /** Used only when the entity has no messages at all. */
    fallbackActivityAt: number;
    idleMinutes: number;
  },
) {
  const lastMessage = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
    .order("desc")
    .first();
  const queued = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", args.parentId))
    .order("asc")
    .first();
  // A queue waiting out a usage limit sends nothing for hours, so it must not
  // keep the VM billing; its resume drain wakes the sandbox again.
  const queueWillSend =
    queued !== null &&
    (await usageLimitHoldFor(ctx, args.parentId, queued)) === null;
  return idleStopDecision({
    now: Date.now(),
    lastActivityAt: lastMessage?.timestamp ?? args.fallbackActivityAt,
    busy: args.busy || queueWillSend,
    idleMs: args.idleMinutes * MINUTE_MS,
  });
}

/**
 * Explains the stop in the chat before it happens. The stop path's own
 * "Sandbox stopped" divider lands once the provider confirms; without this
 * line a user coming back would only see that the VM went away, not why.
 */
async function insertIdleStopAlert(
  ctx: MutationCtx,
  parentId: ParentId,
  idleMinutes: number,
): Promise<void> {
  await ctx.db.insert("messages", {
    parentId,
    role: "assistant",
    content: idleStopAlertText(idleMinutes),
    timestamp: Date.now(),
    isSystemAlert: true,
  });
}

/**
 * Internal: stops one session sandbox if idle. Re-validates `active` and
 * recomputes activity inside the mutation, so a message sent between the scan
 * and this call keeps the sandbox up. Returns whether a stop was requested.
 */
export const stopIdleSession = internalMutation({
  args: { sessionId: v.id("sessions"), idleMinutes: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { sessionId, idleMinutes }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.status !== "active" || !session.sandboxId) {
      return false;
    }
    const decision = await decideIdle(ctx, {
      parentId: sessionId,
      busy:
        session.activeWorkflowId !== undefined ||
        session.pendingTurn !== undefined,
      fallbackActivityAt: session.updatedAt ?? session._creationTime,
      idleMinutes,
    });
    if (!decision.stop) return false;
    console.log(
      `[sandbox][idle-stop] stopping session sessionId=${sessionId} sandboxId=${session.sandboxId} idleForMs=${decision.idleForMs}`,
    );
    await insertIdleStopAlert(ctx, sessionId, idleMinutes);
    await requestSessionSandboxStop(ctx, sessionId);
    return true;
  },
});

/** Internal: stops one quick-task preview sandbox if idle. See `stopIdleSession`. */
export const stopIdleTask = internalMutation({
  args: { taskId: v.id("agentTasks"), idleMinutes: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { taskId, idleMinutes }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.reviewTaskSandboxStatus !== "active" || !task.sandboxId) {
      return false;
    }
    const decision = await decideIdle(ctx, {
      parentId: taskId,
      // `activeWorkflowId` is the task's own run, `activeChatWorkflowId` the
      // in-sandbox chat; `in_progress` covers the gap between a run being
      // claimed and its workflow id landing on the row.
      busy:
        task.status === "in_progress" ||
        task.activeWorkflowId !== undefined ||
        task.activeChatWorkflowId !== undefined ||
        task.pendingTurn !== undefined,
      fallbackActivityAt: task.updatedAt ?? task._creationTime,
      idleMinutes,
    });
    if (!decision.stop) return false;
    console.log(
      `[sandbox][idle-stop] stopping task taskId=${taskId} sandboxId=${task.sandboxId} idleForMs=${decision.idleForMs}`,
    );
    await insertIdleStopAlert(ctx, taskId, idleMinutes);
    await requestTaskSandboxStop(ctx, taskId);
    return true;
  },
});

/** Internal: stops one project sandbox if idle. See `stopIdleSession`. */
export const stopIdleProject = internalMutation({
  args: { projectId: v.id("projects"), idleMinutes: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { projectId, idleMinutes }) => {
    const project = await ctx.db.get(projectId);
    if (
      !project ||
      project.reviewProjectSandboxStatus !== "active" ||
      !project.sandboxId
    ) {
      return false;
    }
    const decision = await decideIdle(ctx, {
      parentId: projectId,
      // A project build runs its tasks on this same sandbox, so the build
      // workflow counts as busy alongside the spec workflow and the chat.
      busy:
        project.activeWorkflowId !== undefined ||
        project.activeBuildWorkflowId !== undefined ||
        project.activeChatWorkflowId !== undefined ||
        project.pendingTurn !== undefined,
      fallbackActivityAt: project.updatedAt ?? project._creationTime,
      idleMinutes,
    });
    if (!decision.stop) return false;
    console.log(
      `[sandbox][idle-stop] stopping project projectId=${projectId} sandboxId=${project.sandboxId} idleForMs=${decision.idleForMs}`,
    );
    await insertIdleStopAlert(ctx, projectId, idleMinutes);
    await requestProjectSandboxStop(ctx, projectId);
    return true;
  },
});

/**
 * Cron entry point (every 5 minutes). Lists every active sandbox and asks each
 * surface's mutation to stop it if idle. Per-entity decisions live in the
 * mutations so the activity check and the status flip are one atomic write.
 */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const settings = await ctx.runQuery(
      internal.sandboxIdleStop.getSettingsInternal,
      {},
    );
    if (!settings.enabled) return null;

    const active = await ctx.runQuery(
      internal.sandboxAutoStop.listActiveSandboxes,
      {},
    );
    const idleMinutes = settings.minutes;
    let stopped = 0;
    for (const sessionId of active.sessionIds) {
      if (
        await ctx.runMutation(internal.sandboxIdleStop.stopIdleSession, {
          sessionId,
          idleMinutes,
        })
      ) {
        stopped += 1;
      }
    }
    for (const taskId of active.taskIds) {
      if (
        await ctx.runMutation(internal.sandboxIdleStop.stopIdleTask, {
          taskId,
          idleMinutes,
        })
      ) {
        stopped += 1;
      }
    }
    for (const projectId of active.projectIds) {
      if (
        await ctx.runMutation(internal.sandboxIdleStop.stopIdleProject, {
          projectId,
          idleMinutes,
        })
      ) {
        stopped += 1;
      }
    }
    if (stopped > 0) {
      console.log(
        `[sandbox][idle-stop] sweep stopped=${stopped} of active=${active.sessionIds.length + active.taskIds.length + active.projectIds.length} idleMinutes=${idleMinutes}`,
      );
    }
    return null;
  },
});
