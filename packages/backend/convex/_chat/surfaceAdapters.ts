import { TURN_BACKSTOP_ERROR } from "@eva/shared/agentTurnLimits";
import type { Id } from "../_generated/dataModel";
import type {
  DatabaseReader,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";
import { openTurnWorkflowId } from "./turnProjection";
import { internal } from "../_generated/api";
import {
  getAIModelProvider,
  normalizeAIModel,
  usesChatDaemon,
} from "../validators";
import { RUN_TIMEOUT_MS } from "../_taskWorkflow/staleness";
import type { WorkflowId } from "@convex-dev/workflow";
import { STALL_ALERT_TEXT } from "./stallRetry";
import { markAllRunningExited } from "../backgroundProcesses";
import type { TurnLane } from "../validators";
import {
  loadSessionChat,
  sessionChatStreamingEntityId,
  type SessionChatContext,
} from "../_sessionChats/helpers";

/** A standalone system-alert message surfaced when a stale turn is torn down. */
export type ChatAlert = { text: string; detail?: string };

/** Every chat entity id: a session chat. */
export type ChatEntityId = Id<"sessionChats">;

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
  kind: "sessionChat";
  logLabel: string;
  idLogLabel: string;
  parseId: (db: DatabaseReader, raw: string) => TId | null;
  getEntity: (ctx: MutationCtx, id: TId) => Promise<TEntity | null>;
  activeWorkflowId: (
    entity: TEntity,
    ctx: QueryCtx,
  ) => string | undefined | Promise<string | undefined>;
  streamingEntityId: (id: TId) => string;
  parseStreamingEntityId: (
    db: DatabaseReader,
    streamingEntityId: string,
  ) => TId | null;
  extraStreamingClears: (id: TId) => string[];
  syntheticTurnMessageId: (entity: TEntity) => Id<"messages"> | undefined;
  sandboxId: (entity: TEntity) => string | undefined;
  repoId: (entity: TEntity) => Id<"githubRepos"> | undefined;
  interrupt: (ctx: MutationCtx, entity: TEntity) => Promise<void>;
  release: (
    ctx: MutationCtx,
    id: TId,
    opts: { sandboxStopped: boolean },
  ) => Promise<void>;
  finalizeOrphanTurn: (ctx: MutationCtx, id: TId) => Promise<void>;
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

const timeoutAlert: ChatAlert = {
  text: "Execution timed out.",
  detail: `${TURN_BACKSTOP_ERROR}.`,
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
  activeWorkflowId: ({ chat }, ctx) => openTurnWorkflowId(ctx, chat._id),
  streamingEntityId: (id) => sessionChatStreamingEntityId(id),
  parseStreamingEntityId: (db, streamingEntityId) =>
    db.normalizeId("sessionChats", streamingEntityId),
  extraStreamingClears: () => [],
  syntheticTurnMessageId: ({ chat }) => chat.syntheticTurnMessageId,
  sandboxId: ({ session }) => session.sandboxId,
  repoId: ({ session }) => session.repoId,
  interrupt: async (ctx, { chat, session }) => {
    const model = normalizeAIModel(chat.lastModel);
    if (getAIModelProvider(model) === "claude") {
      await ctx.db.patch(chat._id, { cancelRequestedAt: Date.now() });
    } else if (session.sandboxId && usesChatDaemon(model)) {
      await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
        sandboxId: session.sandboxId,
        repoId: session.repoId,
        entityIdField: "chatId",
        entityId: String(chat._id),
      });
    } else if (session.sandboxId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
        sandboxId: session.sandboxId,
        repoId: session.repoId,
      });
    }
  },
  release: async (ctx, id, opts) => {
    await ctx.db.patch(id, {
      syntheticTurnMessageId: undefined,
      pendingTurn: undefined,
      updatedAt: Date.now(),
    });
    if (opts.sandboxStopped) {
      const chat = await ctx.db.get(id);
      const session = chat ? await ctx.db.get(chat.sessionId) : null;
      if (session?.status === "active") {
        await markAllRunningExited(ctx.db, session._id);
        await ctx.db.patch(session._id, {
          status: "closed",
          updatedAt: Date.now(),
        });
      }
    }
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

/**
 * Every chat surface's adapter, registered once. The drift-guard test
 * (`tests/chatSurfaceUnificationContract.test.ts`) pins that a fourth surface
 * cannot exist without appearing here.
 */
export const chatSurfaceAdapters = [sessionChatAdapter] as const;

export { sessionChatAdapter };

/** Generic over the surface, so one body serves every adapter type-safely. */
export type ChatAdapterVisitor<R> = <TId extends ChatEntityId, TEntity>(
  adapter: ChatSurfaceAdapter<TId, TEntity>,
  id: TId,
) => R;

/**
 * A turn owner that is not a chat: a quick-task run or a one-shot agent. It
 * has no placeholder, queue or synthetic turn, so it does not fit
 * `ChatSurfaceAdapter`. `interview` works on a chat row and is told apart from
 * its chat turns by the turn's lane.
 */
export type AgentTurnOwner =
  | { kind: "run"; id: Id<"agentRuns"> }
  | { kind: "automation"; id: Id<"automationRuns"> }
  | { kind: "doc"; id: Id<"docs"> }
  | { kind: "evaluation"; id: Id<"evaluationReports"> }
  | { kind: "interview"; id: Id<"sessions"> };

/** One handler per kind of turn owner. */
export type TurnAdapterVisitor<R> = {
  chat: ChatAdapterVisitor<R>;
  agent: (owner: AgentTurnOwner) => R;
};

function laneOwner(
  db: DatabaseReader,
  entityId: string,
): AgentTurnOwner | null {
  const id = db.normalizeId("sessions", entityId);
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
    const owner = laneOwner(db, turn.entityId);
    return owner ? visit.agent(owner) : null;
  }
  const chatId = sessionChatAdapter.parseId(db, turn.entityId);
  if (chatId) return visit.chat(sessionChatAdapter, chatId);
  const owner = laneFreeAgentOwner(db, turn.entityId);
  return owner ? visit.agent(owner) : null;
}

/**
 * Schedules the `TURN_BACKSTOP_MS` backstop for a session chat workflow. The
 * caller has already bound the workflow to the chat's open turn
 * (`bindTurnWorkflow`): that turn is the only record of it. The turn lease
 * (`turns.reconcile`) is the stall check.
 */
export async function trackSessionChatWorkflow(
  ctx: MutationCtx,
  chatId: Id<"sessionChats">,
  workflowId: WorkflowId,
  timeoutMs: number = RUN_TIMEOUT_MS,
): Promise<void> {
  await ctx.scheduler.runAfter(
    timeoutMs,
    internal.workflowWatchdog.handleStaleSessionChat,
    { chatId, workflowId: String(workflowId) },
  );
}
