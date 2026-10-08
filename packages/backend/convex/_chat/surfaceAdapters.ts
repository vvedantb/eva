import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAIModelProvider, normalizeAIModel } from "../validators";
import {
  RUN_TIMEOUT_MS,
  STALE_CHECK_DELAY_MS,
} from "../_taskWorkflow/staleness";
import {
  drainSessionChatQueues,
  startNextQueuedProjectChatMessage,
  startNextQueuedTaskChatMessage,
} from "../_queues/helpers";
import type { WorkflowId } from "@convex-dev/workflow";
import { STALL_ALERT_TEXT } from "./stallRetry";
import {
  loadSessionChat,
  sessionChatStreamingEntityId,
  type SessionChatContext,
} from "../_sessionChats/helpers";

/** Streaming entityId prefix for project chat workflows. */
export const PROJECT_CHAT_STREAM_PREFIX = "project-chat-";
/** Streaming entityId prefix for agent task chat workflows. */
export const TASK_CHAT_STREAM_PREFIX = "task-chat-";

/** A standalone system-alert message surfaced when a stale turn is torn down. */
export type ChatAlert = { text: string; detail?: string };

/**
 * Everything the shared stall-watchdog logic (`_chat/stallWatchdog.ts`) needs
 * to know about one chat surface (session, task chat, project chat), typed
 * per-surface so the shared code never has to guess a field name or table.
 * Read/write access to the entity is deliberately closure-shaped — every
 * function that touches `ctx.db` for the entity's own table lives inside the
 * adapter, so the generic shared code only ever calls opaque functions
 * instead of writing table-specific patches itself.
 */
export type ChatSurfaceAdapter<
  TId extends Id<"sessionChats"> | Id<"agentTasks"> | Id<"projects">,
  TEntity,
> = {
  kind: "sessionChat" | "taskChat" | "projectChat";
  /** Console-log prefix, e.g. "session", "task-chat", "project-chat". */
  logLabel: string;
  /** Console-log key for the id, e.g. "sessionId". */
  idLogLabel: string;
  getEntity: (ctx: MutationCtx, id: TId) => Promise<TEntity | null>;
  activeWorkflowId: (entity: TEntity) => string | undefined;
  /** Entity id used for the turn's own streamingActivity row. */
  streamingEntityId: (id: TId) => string;
  /** Any additional streamingActivity rows to clear alongside the turn's own (sessions also clear their summary row). */
  extraStreamingClears: (id: TId) => string[];
  syntheticTurnMessageId: (entity: TEntity) => Id<"messages"> | undefined;
  sandboxId: (entity: TEntity) => string | undefined;
  repoId: (entity: TEntity) => Id<"githubRepos"> | undefined;
  /** Interrupts a still-alive agent process the way cancelExecution does. */
  interrupt: (ctx: MutationCtx, entity: TEntity) => Promise<void>;
  /** Clears the active workflow + synthetic turn, and closes the sandbox status field if `sandboxStopped`. */
  release: (
    ctx: MutationCtx,
    id: TId,
    opts: { sandboxStopped: boolean },
  ) => Promise<void>;
  /** Starts the next queued message for this entity, if any. */
  drainQueue: (ctx: MutationCtx, id: TId) => Promise<boolean>;
  /** Schedules (or re-schedules) this surface's own heartbeat-check Convex function. */
  scheduleCheck: (
    ctx: MutationCtx | ActionCtx,
    id: TId,
    delayMs: number,
    args: {
      workflowId: string;
      turnStartedAt: number;
      skipLivenessProbe?: boolean;
      sandboxStopped?: boolean;
    },
  ) => Promise<void>;
  /** Schedules this surface's own pre-kill liveness probe. */
  scheduleProbe: (
    ctx: MutationCtx,
    id: TId,
    args: {
      workflowId: string;
      turnStartedAt: number;
      sandboxId: string;
      repoId: Id<"githubRepos">;
      streamingAgeMs: number;
    },
  ) => Promise<void>;
  alerts: {
    timeout: ChatAlert;
    sandboxStopped: (staleSeconds: number) => ChatAlert;
    stalled: (
      staleSeconds: number,
      phase: string,
      thresholdSeconds: number,
    ) => ChatAlert;
  };
};

/** Alert text shared by every surface when the agent process itself has gone silent (not the sandbox VM). */
function stalledAlert(
  staleSeconds: number,
  phase: string,
  thresholdSeconds: number,
): ChatAlert {
  return {
    text: STALL_ALERT_TEXT,
    detail: `No lease renewal for ${staleSeconds}s (phase: ${phase}, running lease: ${thresholdSeconds}s). The agent process stopped heartbeating. The sandbox was preserved — any committed work is intact. Eva retries an empty stalled prompt once.`,
  };
}

/** Alert text shared by every surface for the 2-hour workflow-timeout backstop. */
const timeoutAlert: ChatAlert = {
  text: "Execution timed out.",
  detail: "Turn exceeded the 2-hour workflow limit.",
};

const sessionChatAdapter: ChatSurfaceAdapter<
  Id<"sessionChats">,
  SessionChatContext
> = {
  kind: "sessionChat",
  logLabel: "session-chat",
  idLogLabel: "chatId",
  getEntity: (ctx, id) => loadSessionChat(ctx.db, id),
  activeWorkflowId: ({ chat }) => chat.activeWorkflowId,
  streamingEntityId: (id) => sessionChatStreamingEntityId(id),
  extraStreamingClears: () => [],
  syntheticTurnMessageId: ({ chat }) => chat.syntheticTurnMessageId,
  sandboxId: ({ session }) => session.sandboxId,
  repoId: ({ session }) => session.repoId,
  interrupt: async (ctx, { chat, session }) => {
    if (getAIModelProvider(normalizeAIModel(chat.lastModel)) === "claude") {
      await ctx.db.patch(chat._id, { cancelRequestedAt: Date.now() });
    } else if (session.sandboxId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
        sandboxId: session.sandboxId,
        repoId: session.repoId,
      });
    }
  },
  release: async (ctx, id, opts) => {
    await ctx.db.patch(id, {
      activeWorkflowId: undefined,
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
    if (opts.sandboxStopped) {
      // Surfaces the stop in the UI — users cannot see the provider
      // dashboard, and an "active" session with a dead VM just looks
      // frozen. "closed" is also what stops page-open prewarm from
      // silently resurrecting the VM (see prewarmDaemon's status guard).
      const chat = await ctx.db.get(id);
      if (chat) {
        await ctx.db.patch(chat.sessionId, {
          status: "closed",
          updatedAt: Date.now(),
        });
      }
    }
  },
  drainQueue: async (ctx, id) => {
    const chat = await ctx.db.get(id);
    if (!chat) return false;
    await drainSessionChatQueues(ctx, chat.sessionId, id);
    return true;
  },
  scheduleCheck: (ctx, id, delayMs, args) =>
    ctx.scheduler
      .runAfter(delayMs, internal.workflowWatchdog.checkStaleSessionHeartbeat, {
        chatId: id,
        workflowId: args.workflowId,
        turnStartedAt: args.turnStartedAt,
        skipLivenessProbe: args.skipLivenessProbe,
        sandboxStopped: args.sandboxStopped,
      })
      .then(() => undefined),
  scheduleProbe: (ctx, id, args) =>
    ctx.scheduler
      .runAfter(0, internal.workflowWatchdog.probeStaleSessionLiveness, {
        chatId: id,
        workflowId: args.workflowId,
        turnStartedAt: args.turnStartedAt,
        sandboxId: args.sandboxId,
        repoId: args.repoId,
        streamingAgeMs: args.streamingAgeMs,
      })
      .then(() => undefined),
  alerts: {
    timeout: timeoutAlert,
    sandboxStopped: (staleSeconds) => ({
      text: "Sandbox stopped while this turn was running.",
      detail: `The sandbox VM is no longer running — it likely hit its runtime limit or was stopped outside Eva (no heartbeat for ${staleSeconds}s). The session is now closed; committed work is preserved. Send a new message or start the sandbox to continue.`,
    }),
    stalled: stalledAlert,
  },
};

const taskChatAdapter: ChatSurfaceAdapter<
  Id<"agentTasks">,
  Doc<"agentTasks">
> = {
  kind: "taskChat",
  logLabel: "task-chat",
  idLogLabel: "taskId",
  getEntity: (ctx, id) => ctx.db.get(id),
  activeWorkflowId: (task) => task.activeChatWorkflowId,
  streamingEntityId: (id) => `${TASK_CHAT_STREAM_PREFIX}${String(id)}`,
  extraStreamingClears: () => [],
  syntheticTurnMessageId: (task) => task.syntheticTurnMessageId,
  sandboxId: (task) => task.sandboxId,
  repoId: (task) => task.repoId,
  interrupt: async (ctx, task) => {
    if (
      getAIModelProvider(normalizeAIModel(task.lastChatModel ?? task.model)) ===
      "claude"
    ) {
      await ctx.db.patch(task._id, { cancelRequestedAt: Date.now() });
    } else if (task.sandboxId && task.repoId) {
      if (task.activeWorkflowId) {
        await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
          sandboxId: task.sandboxId,
          repoId: task.repoId,
          entityIdField: "taskId",
          entityId: String(task._id),
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
          sandboxId: task.sandboxId,
          repoId: task.repoId,
        });
      }
    }
  },
  release: async (ctx, id, opts) => {
    const patch: {
      activeChatWorkflowId: undefined;
      syntheticTurnMessageId: undefined;
      updatedAt: number;
      reviewTaskSandboxStatus?: "closed";
    } = {
      activeChatWorkflowId: undefined,
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    };
    if (opts.sandboxStopped) {
      // Mirrors sessionPatch.status = "closed" above; reviewTaskSandboxStatus
      // tracks the lifecycle of this same task.sandboxId (see
      // _agentTasks/sandbox.ts).
      patch.reviewTaskSandboxStatus = "closed";
    }
    await ctx.db.patch(id, patch);
  },
  drainQueue: (ctx, id) => startNextQueuedTaskChatMessage(ctx, id),
  scheduleCheck: (ctx, id, delayMs, args) =>
    ctx.scheduler
      .runAfter(
        delayMs,
        internal.workflowWatchdog.checkStaleAgentTaskChatHeartbeat,
        {
          taskId: id,
          workflowId: args.workflowId,
          turnStartedAt: args.turnStartedAt,
          skipLivenessProbe: args.skipLivenessProbe,
          sandboxStopped: args.sandboxStopped,
        },
      )
      .then(() => undefined),
  scheduleProbe: (ctx, id, args) =>
    ctx.scheduler
      .runAfter(0, internal.workflowWatchdog.probeStaleAgentTaskChatLiveness, {
        taskId: id,
        workflowId: args.workflowId,
        turnStartedAt: args.turnStartedAt,
        sandboxId: args.sandboxId,
        repoId: args.repoId,
        streamingAgeMs: args.streamingAgeMs,
      })
      .then(() => undefined),
  alerts: {
    timeout: timeoutAlert,
    sandboxStopped: (staleSeconds) => ({
      text: "Sandbox stopped while this turn was running.",
      detail: `The sandbox VM is no longer running — it likely hit its runtime limit or was stopped outside Eva (no heartbeat for ${staleSeconds}s). The sandbox is now closed; committed work is preserved. Send a new message or start the sandbox to continue.`,
    }),
    stalled: stalledAlert,
  },
};

const projectChatAdapter: ChatSurfaceAdapter<
  Id<"projects">,
  Doc<"projects">
> = {
  kind: "projectChat",
  logLabel: "project-chat",
  idLogLabel: "projectId",
  getEntity: (ctx, id) => ctx.db.get(id),
  activeWorkflowId: (project) => project.activeChatWorkflowId,
  streamingEntityId: (id) => `${PROJECT_CHAT_STREAM_PREFIX}${String(id)}`,
  extraStreamingClears: () => [],
  syntheticTurnMessageId: (project) => project.syntheticTurnMessageId,
  sandboxId: (project) => project.sandboxId,
  repoId: (project) => project.repoId,
  interrupt: async (ctx, project) => {
    if (
      getAIModelProvider(
        normalizeAIModel(project.lastChatModel ?? project.model),
      ) === "claude"
    ) {
      await ctx.db.patch(project._id, { cancelRequestedAt: Date.now() });
    } else if (project.sandboxId) {
      if (project.activeWorkflowId || project.activeBuildWorkflowId) {
        await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
          sandboxId: project.sandboxId,
          repoId: project.repoId,
          entityIdField: "projectId",
          entityId: String(project._id),
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
          sandboxId: project.sandboxId,
          repoId: project.repoId,
        });
      }
    }
  },
  release: async (ctx, id, opts) => {
    const patch: {
      activeChatWorkflowId: undefined;
      syntheticTurnMessageId: undefined;
      updatedAt: number;
      reviewProjectSandboxStatus?: "closed";
    } = {
      activeChatWorkflowId: undefined,
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    };
    if (opts.sandboxStopped) {
      // Mirrors sessionPatch.status = "closed" above;
      // reviewProjectSandboxStatus tracks the lifecycle of this same
      // project.sandboxId (see _projects/sandbox.ts).
      patch.reviewProjectSandboxStatus = "closed";
    }
    await ctx.db.patch(id, patch);
  },
  drainQueue: (ctx, id) => startNextQueuedProjectChatMessage(ctx, id),
  scheduleCheck: (ctx, id, delayMs, args) =>
    ctx.scheduler
      .runAfter(
        delayMs,
        internal.workflowWatchdog.checkStaleProjectChatHeartbeat,
        {
          projectId: id,
          workflowId: args.workflowId,
          turnStartedAt: args.turnStartedAt,
          skipLivenessProbe: args.skipLivenessProbe,
          sandboxStopped: args.sandboxStopped,
        },
      )
      .then(() => undefined),
  scheduleProbe: (ctx, id, args) =>
    ctx.scheduler
      .runAfter(0, internal.workflowWatchdog.probeStaleProjectChatLiveness, {
        projectId: id,
        workflowId: args.workflowId,
        turnStartedAt: args.turnStartedAt,
        sandboxId: args.sandboxId,
        repoId: args.repoId,
        streamingAgeMs: args.streamingAgeMs,
      })
      .then(() => undefined),
  alerts: {
    timeout: timeoutAlert,
    sandboxStopped: (staleSeconds) => ({
      text: "Sandbox stopped while this turn was running.",
      detail: `The sandbox VM is no longer running — it likely hit its runtime limit or was stopped outside Eva (no heartbeat for ${staleSeconds}s). The sandbox is now closed; committed work is preserved. Send a new message or start the sandbox to continue.`,
    }),
    stalled: stalledAlert,
  },
};

/**
 * Every chat surface's adapter, registered once. The drift-guard test
 * (`tests/chatSurfaceUnificationContract.test.ts`) pins that a fourth surface
 * cannot exist without appearing here.
 */
export const chatSurfaceAdapters = [
  sessionChatAdapter,
  taskChatAdapter,
  projectChatAdapter,
] as const;

export { sessionChatAdapter, taskChatAdapter, projectChatAdapter };

/** Records a workflow as the active workflow for a session chat and schedules a stale handler. */
export async function trackSessionWorkflow(
  ctx: MutationCtx,
  chatId: Id<"sessionChats">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(chatId, { activeWorkflowId: id });
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleSession,
    { chatId, workflowId: id },
  );
  // No-heartbeat watchdog: the in-sandbox callback touches streamingActivity
  // at least every ~15s while a turn runs, so a silently dead agent process
  // (OOM) shows up as a stale row within minutes. Without this chain the chat
  // sat on "Working…" until the 2h handleStaleSession backstop above.
  await ctx.scheduler.runAfter(
    STALE_CHECK_DELAY_MS,
    internal.workflowWatchdog.checkStaleSessionHeartbeat,
    { chatId, workflowId: id, turnStartedAt: Date.now() },
  );
}

/** Records a workflow as the active chat workflow for a project and schedules a stale handler. */
export async function trackProjectChatWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(projectId, { activeChatWorkflowId: id });
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleProjectChat,
    { projectId, workflowId: id },
  );
  // No-heartbeat watchdog — same rationale as trackSessionWorkflow above.
  await ctx.scheduler.runAfter(
    STALE_CHECK_DELAY_MS,
    internal.workflowWatchdog.checkStaleProjectChatHeartbeat,
    { projectId, workflowId: id, turnStartedAt: Date.now() },
  );
}

/** Records a workflow as the active chat workflow for an agent task and schedules a stale handler. */
export async function trackAgentTaskChatWorkflow(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(taskId, { activeChatWorkflowId: id });
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleAgentTaskChat,
    { taskId, workflowId: id },
  );
  // No-heartbeat watchdog — same rationale as trackSessionWorkflow above.
  await ctx.scheduler.runAfter(
    STALE_CHECK_DELAY_MS,
    internal.workflowWatchdog.checkStaleAgentTaskChatHeartbeat,
    { taskId, workflowId: id, turnStartedAt: Date.now() },
  );
}
