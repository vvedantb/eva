import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAIModelProvider, normalizeAIModel } from "../validators";
import { RUN_TIMEOUT_MS } from "../_taskWorkflow/staleness";
import {
  drainSessionChatQueues,
  startNextQueuedProjectChatMessage,
  startNextQueuedTaskChatMessage,
} from "../_queues/helpers";
import type { WorkflowId } from "@convex-dev/workflow";
import { STALL_ALERT_TEXT } from "./stallRetry";
import type { TurnLane } from "../validators";
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

/** Every chat entity id. The table, not a label, decides the surface. */
export type ChatEntityId =
  | Id<"sessionChats">
  | Id<"agentTasks">
  | Id<"projects">;

/**
 * Everything the shared stall-watchdog logic (`_chat/stallWatchdog.ts`) needs
 * to know about one chat surface (session, task chat, project chat), typed
 * per-surface so the shared code never has to guess a field name or table.
 * Read/write access to the entity is deliberately closure-shaped — every
 * function that touches `ctx.db` for the entity's own table lives inside the
 * adapter, so the generic shared code only ever calls opaque functions
 * instead of writing table-specific patches itself.
 */
export type ChatSurfaceAdapter<TId extends ChatEntityId, TEntity> = {
  kind: "sessionChat" | "taskChat" | "projectChat";
  /** Console-log prefix, e.g. "session", "task-chat", "project-chat". */
  logLabel: string;
  /** Console-log key for the id, e.g. "sessionId". */
  idLogLabel: string;
  /** This surface's id when `raw` names a row of its table, else null. */
  parseId: (db: DatabaseReader, raw: string) => TId | null;
  getEntity: (ctx: MutationCtx, id: TId) => Promise<TEntity | null>;
  activeWorkflowId: (entity: TEntity) => string | undefined;
  /** Entity id used for the turn's own streamingActivity row. */
  streamingEntityId: (id: TId) => string;
  /** Inverse of `streamingEntityId`: null when the row is not this surface's turn row. */
  parseStreamingEntityId: (
    db: DatabaseReader,
    streamingEntityId: string,
  ) => TId | null;
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
  /**
   * Entity side of an expired turn that never bound a workflow (a synthetic
   * turn): frees the synthetic slot. The caller has already closed the
   * placeholder and the streaming row, and drains the queue after.
   */
  finalizeOrphanTurn: (ctx: MutationCtx, id: TId) => Promise<void>;
  /**
   * Runs after the lease reconciler finalises a stalled (not sandbox-stopped)
   * turn. Every chat schedules its one-shot empty-stall retry here.
   */
  afterStallFinalize: (
    ctx: MutationCtx,
    id: TId,
    turnId: Id<"turns">,
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
export function stalledAlert(
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
  parseId: (db, raw) => db.normalizeId("sessionChats", raw),
  getEntity: (ctx, id) => loadSessionChat(ctx.db, id),
  activeWorkflowId: ({ chat }) => chat.activeWorkflowId,
  streamingEntityId: (id) => sessionChatStreamingEntityId(id),
  parseStreamingEntityId: (db, streamingEntityId) =>
    db.normalizeId("sessionChats", streamingEntityId),
  extraStreamingClears: () => [],
  syntheticTurnMessageId: ({ chat }) => chat.syntheticTurnMessageId,
  sandboxId: ({ session }) => session.sandboxId,
  repoId: ({ session }) => session.repoId,
  interrupt: async (ctx, { chat, session }) => {
    if (getAIModelProvider(normalizeAIModel(chat.lastModel)) === "claude") {
      await ctx.db.patch(chat._id, { cancelRequestedAt: Date.now() });
    } else if (session.sandboxId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
        sandboxId: session.sandboxId,
        repoId: session.repoId,
        entityIdField: "chatId",
        entityId: String(chat._id),
      });
    }
  },
  release: async (ctx, id, opts) => {
    // The dead turn's prompt is still sitting in the handoff slot whenever no
    // daemon claimed it, and nothing else ever empties that slot: claim and
    // saveResult are both paths this turn never reached. Left behind, the
    // orphan blocks `ensurePendingTurn` for every later turn, so the chat
    // opens turns no daemon can claim and stalls each one out forever.
    // Cleared before `drainQueue` restages the next message.
    await ctx.db.patch(id, {
      activeWorkflowId: undefined,
      syntheticTurnMessageId: undefined,
      pendingTurn: undefined,
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
    return await drainSessionChatQueues(ctx, chat.sessionId, id);
  },
  finalizeOrphanTurn: async (ctx, id) => {
    await ctx.db.patch(id, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
  },
  afterStallFinalize: async (ctx, id, turnId) => {
    await ctx.scheduler.runAfter(
      0,
      internal._sessions.execution.retryEmptyStalledSessionTurn,
      { chatId: id, turnId, sandboxStopped: false },
    );
  },
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
  parseId: (db, raw) => db.normalizeId("agentTasks", raw),
  getEntity: (ctx, id) => ctx.db.get(id),
  activeWorkflowId: (task) => task.activeChatWorkflowId,
  streamingEntityId: (id) => `${TASK_CHAT_STREAM_PREFIX}${String(id)}`,
  parseStreamingEntityId: (db, streamingEntityId) =>
    streamingEntityId.startsWith(TASK_CHAT_STREAM_PREFIX)
      ? db.normalizeId(
          "agentTasks",
          streamingEntityId.slice(TASK_CHAT_STREAM_PREFIX.length),
        )
      : null,
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
  finalizeOrphanTurn: async (ctx, id) => {
    await ctx.db.patch(id, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
  },
  afterStallFinalize: async (ctx, id, turnId) => {
    await ctx.scheduler.runAfter(
      0,
      internal.agentTaskChatWorkflow.retryEmptyStalledTurn,
      { taskId: id, turnId },
    );
  },
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
  parseId: (db, raw) => db.normalizeId("projects", raw),
  getEntity: (ctx, id) => ctx.db.get(id),
  activeWorkflowId: (project) => project.activeChatWorkflowId,
  streamingEntityId: (id) => `${PROJECT_CHAT_STREAM_PREFIX}${String(id)}`,
  parseStreamingEntityId: (db, streamingEntityId) =>
    streamingEntityId.startsWith(PROJECT_CHAT_STREAM_PREFIX)
      ? db.normalizeId(
          "projects",
          streamingEntityId.slice(PROJECT_CHAT_STREAM_PREFIX.length),
        )
      : null,
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
  finalizeOrphanTurn: async (ctx, id) => {
    await ctx.db.patch(id, {
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    });
  },
  afterStallFinalize: async (ctx, id, turnId) => {
    await ctx.scheduler.runAfter(
      0,
      internal.projectChatWorkflow.retryEmptyStalledTurn,
      { projectId: id, turnId },
    );
  },
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

/** Generic over the surface, so one body serves every adapter type-safely. */
export type ChatAdapterVisitor<R> = <TId extends ChatEntityId, TEntity>(
  adapter: ChatSurfaceAdapter<TId, TEntity>,
  id: TId,
) => R;

/**
 * A turn owner that is not a chat: a quick-task run or a one-shot agent. It
 * has no placeholder, queue or synthetic turn, so it does not fit
 * `ChatSurfaceAdapter`. `summary` and `interview` work on a chat row and are
 * told apart from its chat turns by the turn's lane.
 */
export type AgentTurnOwner =
  | { kind: "run"; id: Id<"agentRuns"> }
  | { kind: "automation"; id: Id<"automationRuns"> }
  | { kind: "doc"; id: Id<"docs"> }
  | { kind: "evaluation"; id: Id<"evaluationReports"> }
  | { kind: "summary"; id: Id<"sessions"> }
  | { kind: "interview"; id: Id<"projects"> };

/** One handler per kind of turn owner. */
export type TurnAdapterVisitor<R> = {
  chat: ChatAdapterVisitor<R>;
  agent: (owner: AgentTurnOwner) => R;
};

function laneOwner(
  db: DatabaseReader,
  entityId: string,
  lane: TurnLane,
): AgentTurnOwner | null {
  if (lane === "summary") {
    const id = db.normalizeId("sessions", entityId);
    return id ? { kind: "summary", id } : null;
  }
  const id = db.normalizeId("projects", entityId);
  return id ? { kind: "interview", id } : null;
}

function laneFreeAgentOwner(
  db: DatabaseReader,
  entityId: string,
): AgentTurnOwner | null {
  const runId = db.normalizeId("agentRuns", entityId);
  if (runId) return { kind: "run", id: runId };
  const automationRunId = db.normalizeId("automationRuns", entityId);
  if (automationRunId) return { kind: "automation", id: automationRunId };
  const docId = db.normalizeId("docs", entityId);
  if (docId) return { kind: "doc", id: docId };
  const reportId = db.normalizeId("evaluationReports", entityId);
  if (reportId) return { kind: "evaluation", id: reportId };
  return null;
}

/**
 * Picks the adapter for a durable turn by its `entityId` table and lane, then
 * hands it and the parsed id to the matching handler. Null when no turn owner
 * table holds the id.
 */
export function turnAdapterForEntity<R>(
  db: DatabaseReader,
  turn: { entityId: string; lane?: TurnLane },
  visit: TurnAdapterVisitor<R>,
): R | null {
  if (turn.lane !== undefined) {
    const owner = laneOwner(db, turn.entityId, turn.lane);
    return owner ? visit.agent(owner) : null;
  }
  const chatId = sessionChatAdapter.parseId(db, turn.entityId);
  if (chatId) return visit.chat(sessionChatAdapter, chatId);
  const taskId = taskChatAdapter.parseId(db, turn.entityId);
  if (taskId) return visit.chat(taskChatAdapter, taskId);
  const projectId = projectChatAdapter.parseId(db, turn.entityId);
  if (projectId) return visit.chat(projectChatAdapter, projectId);
  const owner = laneFreeAgentOwner(db, turn.entityId);
  return owner ? visit.agent(owner) : null;
}

/**
 * Records a workflow as the active workflow for a session chat and schedules
 * the 2-hour backstop. The turn lease (`turns.reconcile`) is the stall check.
 */
export async function trackSessionChatWorkflow(
  ctx: MutationCtx,
  chatId: Id<"sessionChats">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(chatId, { activeWorkflowId: id });
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleSessionChat,
    { chatId, workflowId: id },
  );
}

/**
 * Records a session-level workflow (the summary) as the session's active
 * workflow and schedules the 2-hour backstop. Chat turns track on their chat
 * (`trackSessionChatWorkflow`); this slot is only for work on the session row.
 */
export async function trackSessionWorkflow(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  const id = String(workflowId);
  await ctx.db.patch(sessionId, { activeWorkflowId: id });
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleSession,
    { sessionId, workflowId: id },
  );
}

/** Records the active chat workflow for a project; see `trackSessionWorkflow`. */
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
}

/** Records the active chat workflow for an agent task; see `trackSessionWorkflow`. */
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
}
