import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  acquireTurnLease,
  graceExpiredTurnLease,
  openSessionChatTurn,
  openTurn,
  renewTurnLease,
  findOpenTurn,
} from "../convex/_chat/turnStore";
import {
  TASK_CHAT_STREAM_PREFIX,
  taskChatAdapter,
  turnAdapterForEntity,
} from "../convex/_chat/surfaceAdapters";
import { getTaskRunStreamingEntityId } from "../convex/_taskWorkflow/helpers";
import { sessionSummaryStreamingEntityId } from "../convex/_chat/agentStreamIds";
import {
  hasOpenChatTurn,
  isLegacySessionExecuting,
  openChatEntityIdsForRepo,
  taskIsExecuting,
} from "../convex/_chat/turnProjection";
import { finalizeStaleChatTurn } from "../convex/_chat/stallWatchdog";
import { shouldWriteTurnLeaseRenewal } from "../convex/_chat/turnLease";
import { STALL_ALERT_TEXT } from "../convex/_chat/stallRetry";
import { RUN_TIMEOUT_MS } from "../convex/_taskWorkflow/staleness";
import { rollbackQueuedChatStart } from "../convex/_queues/helpers";
import {
  appendCurrentTurnLease,
  beginTurnOwnership,
  endTurnOwnership,
  getLeaseTerminalReason,
  noteHeartbeatResponse,
} from "../callback-src/runtime/turnLease";
import type { JsonObject } from "../callback-src/types";

const modules = import.meta.glob("../convex/**/*.ts");

async function createSessionFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "turn-lifecycle-test",
      installationId: 1,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Lifecycle test",
      status: "active",
    });
    // A session's turn belongs to one of its chats.
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    const placeholderMessageId = await ctx.db.insert("messages", {
      parentId: chatId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    const turnId = await openSessionChatTurn(ctx, {
      chatId,
      sessionId,
      streamingEntityId: String(chatId),
      placeholderMessageId,
      prompt: "hi",
      model: "claude:sonnet",
      repoId,
    });
    return { sessionId, chatId, placeholderMessageId, turnId };
  });
  return { t, ...ids };
}

/** A task chat turn inserted by hand: nothing stages task turns yet. */
async function createTaskChatFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "task-turn-test",
      installationId: 1,
    });
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Task chat turn",
      status: "code_review",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    const placeholderMessageId = await ctx.db.insert("messages", {
      parentId: taskId,
      role: "assistant",
      content: "",
      timestamp: now,
    });
    await ctx.db.patch(taskId, {
      syntheticTurnMessageId: placeholderMessageId,
    });
    const streamingEntityId = `${TASK_CHAT_STREAM_PREFIX}${String(taskId)}`;
    const turnId = await openTurn(ctx, {
      entityId: taskId,
      streamingEntityId,
      placeholderMessageId,
      prompt: "hi",
      model: "claude:sonnet",
      repoId,
    });
    return { repoId, taskId, placeholderMessageId, streamingEntityId, turnId };
  });
  return { t, ...ids };
}

describe("turn lifecycle integration", () => {
  test("opening the first durable Turn permanently marks the session cutover", async () => {
    const { t, sessionId } = await createSessionFixture();
    const session = await t.run(async (ctx) => await ctx.db.get(sessionId));
    expect(session?.turnLifecycleVersion).toBe(2);
  });

  test("queued workflow start rollback closes its Turn and removes its placeholder", async () => {
    const { t, chatId, placeholderMessageId, turnId } =
      await createSessionFixture();

    await t.run(
      async (ctx) =>
        await rollbackQueuedChatStart(ctx, {
          entityId: chatId,
          turnId,
          placeholderMessageId,
        }),
    );

    const rows = await t.run(async (ctx) => ({
      turn: await ctx.db.get(turnId),
      placeholder: await ctx.db.get(placeholderMessageId),
    }));
    expect(rows.turn?.open).toBe(false);
    expect(rows.turn?.state).toBe("error");
    expect(rows.placeholder).toBeNull();
  });

  test("each claim bumps the lease generation and fences the older one", async () => {
    const { t, turnId } = await createSessionFixture();
    const claim = async (): Promise<number | undefined> =>
      await t.run(async (ctx) => {
        const turn = await ctx.db.get(turnId);
        if (!turn) throw new Error("missing turn");
        const identity = await acquireTurnLease(ctx, turn, "running");
        return identity?.leaseGeneration;
      });
    const renew = async (leaseGeneration: number) =>
      await t.run(
        async (ctx) =>
          await renewTurnLease(ctx, {
            turnId: String(turnId),
            leaseGeneration,
          }),
      );

    expect(await claim()).toBe(1);
    expect(await renew(1)).toMatchObject({ status: "renewed" });

    // A respawned daemon reclaims the same open turn.
    expect(await claim()).toBe(2);

    expect(await renew(1)).toEqual({
      status: "terminal",
      reason: "superseded",
    });
    expect(await renew(2)).toMatchObject({ status: "renewed" });
  });

  test("a heartbeat for a closed or unknown turn is told to stop", async () => {
    const { t, sessionId, turnId } = await createSessionFixture();
    const closed = await t.run(async (ctx) => {
      await ctx.db.patch(turnId, { open: false, state: "done" });
      return await renewTurnLease(ctx, {
        turnId: String(turnId),
        leaseGeneration: 0,
      });
    });
    expect(closed).toEqual({ status: "terminal", reason: "closed" });

    const unknown = await t.run(
      async (ctx) =>
        await renewTurnLease(ctx, {
          turnId: String(sessionId),
          leaseGeneration: 0,
        }),
    );
    expect(unknown).toEqual({ status: "terminal", reason: "unknown_turn" });
  });

  test("a fresh running lease is not rewritten by a second heartbeat", async () => {
    const { t, turnId } = await createSessionFixture();
    const first = await t.run(async (ctx) => {
      const turn = await ctx.db.get(turnId);
      if (!turn) throw new Error("missing turn");
      return await renewTurnLease(ctx, {
        turnId: String(turnId),
        leaseGeneration: turn.leaseGeneration,
      });
    });
    expect(first.status).toBe("renewed");

    const second = await t.run(async (ctx) => {
      const before = await ctx.db.get(turnId);
      if (!before) throw new Error("missing turn");
      const result = await renewTurnLease(ctx, {
        turnId: String(turnId),
        leaseGeneration: before.leaseGeneration,
      });
      const after = await ctx.db.get(turnId);
      return {
        result,
        leaseExpiresAt: before.leaseExpiresAt,
        afterExpiresAt: after?.leaseExpiresAt,
        afterState: after?.state,
      };
    });

    expect(second.result.status).toBe("renewed");
    expect(second.afterExpiresAt).toBe(second.leaseExpiresAt);
    expect(second.afterState).toBe("running");
  });

  test("an expired lease on a live process is graced and stamped once", async () => {
    const { t, turnId } = await createSessionFixture();
    const expireLease = async () =>
      await t.run(async (ctx) => {
        await ctx.db.patch(turnId, {
          state: "running",
          leaseExpiresAt: Date.now() - 1,
        });
      });
    const grace = async () =>
      await t.run(async (ctx) => {
        const turn = await ctx.db.get(turnId);
        if (!turn) throw new Error("missing turn");
        await graceExpiredTurnLease(ctx, turn, Date.now());
        return await ctx.db.get(turnId);
      });

    await expireLease();
    const first = await grace();
    expect(first?.open).toBe(true);
    expect(first?.leaseExpiresAt).toBeGreaterThan(Date.now());
    expect(first?.silentSince).toBeGreaterThan(0);

    await expireLease();
    const second = await grace();
    expect(second?.silentSince).toBe(first?.silentSince);
    expect(second?.leaseExpiresAt).toBeGreaterThan(Date.now());
  });

  test("a recovered daemon's heartbeat clears the silent marker", async () => {
    const { t, turnId } = await createSessionFixture();
    const leaseGeneration = await t.run(async (ctx) => {
      const turn = await ctx.db.get(turnId);
      if (!turn) throw new Error("missing turn");
      const identity = await acquireTurnLease(ctx, turn, "running");
      if (!identity) throw new Error("lease not acquired");
      await ctx.db.patch(turnId, { leaseExpiresAt: Date.now() - 1 });
      const expired = await ctx.db.get(turnId);
      if (!expired) throw new Error("missing turn");
      await graceExpiredTurnLease(ctx, expired, Date.now());
      return identity.leaseGeneration;
    });

    const stamped = await t.run(async (ctx) => await ctx.db.get(turnId));
    expect(stamped?.silentSince).toBeGreaterThan(0);
    // A full lease was just written by the grace, so the renewal throttle
    // would normally skip the write — the silent marker must override it.
    expect(stamped?.leaseExpiresAt).toBeGreaterThan(Date.now() + 60_000);

    const renewed = await t.run(async (ctx) => {
      const verdict = await renewTurnLease(ctx, {
        turnId: String(turnId),
        leaseGeneration,
      });
      return { verdict, turn: await ctx.db.get(turnId) };
    });
    expect(renewed.verdict.status).toBe("renewed");
    expect(renewed.turn?.silentSince).toBeUndefined();
  });

  test("a silent-timeout finalisation closes the turn with the stall alert", async () => {
    const { t, placeholderMessageId, turnId } = await createSessionFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(turnId, {
        state: "running",
        leaseExpiresAt: Date.now() - 1,
        silentSince: Date.now() - 10 * 60 * 1000,
      });
    });

    // finalizeExpired schedules the one-shot stall retry; drain it inside the
    // test so it never fires against a later test's database.
    vi.useFakeTimers();
    try {
      await t.mutation(internal.turns.finalizeExpired, {
        turnId,
        cause: "silent_timeout",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    const rows = await t.run(async (ctx) => ({
      turn: await ctx.db.get(turnId),
      placeholder: await ctx.db.get(placeholderMessageId),
    }));
    expect(rows.turn?.open).toBe(false);
    expect(rows.turn?.state).toBe("error");
    expect(rows.placeholder?.content).toContain("Turn stalled");
  });

  /**
   * Grace is the only path that extends a lease without the daemon asking, so
   * it is also the only one that could keep a wedged turn open forever. The
   * 2-hour backstop must win even while the probe still reports the process
   * alive.
   */
  test("grace closes a turn that passed the absolute 2-hour limit", async () => {
    const { t, turnId } = await createSessionFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(turnId, {
        state: "running",
        turnStartedAt: Date.now() - RUN_TIMEOUT_MS - 1,
        leaseExpiresAt: Date.now() - 1,
      });
      const turn = await ctx.db.get(turnId);
      if (!turn) throw new Error("missing turn");
      await graceExpiredTurnLease(ctx, turn, Date.now());
    });

    const turn = await t.run(async (ctx) => await ctx.db.get(turnId));
    expect(turn?.open).toBe(false);
    expect(turn?.state).toBe("error");
    expect(turn?.error).toContain("2-hour limit");
    // No silent marker on a closed turn: nothing is waiting for it any more.
    expect(turn?.silentSince).toBeUndefined();
  });

  /**
   * The reconciler reads expired turns in a batch and mutates them one at a
   * time; a daemon that renews in between must not be marked silent, or its
   * next stall would start the 10-minute clock from a lie.
   */
  test("graceExpired leaves a turn whose lease was renewed in the meantime", async () => {
    const { t, turnId } = await createSessionFixture();
    const before = await t.run(async (ctx) => {
      await ctx.db.patch(turnId, {
        state: "running",
        leaseExpiresAt: Date.now() + 60_000,
      });
      return await ctx.db.get(turnId);
    });

    await t.mutation(internal.turns.graceExpired, { turnId });

    const after = await t.run(async (ctx) => await ctx.db.get(turnId));
    expect(after?.silentSince).toBeUndefined();
    expect(after?.leaseExpiresAt).toBe(before?.leaseExpiresAt);
    expect(after?.open).toBe(true);
  });

  /**
   * `finalizeExpired` took a `sandboxStopped` boolean before the grace work
   * split it into three causes. The user-visible alert is what tells a stopped
   * VM apart from a dead agent process, so pin the mapping in both directions.
   */
  test.each([
    {
      cause: "sandbox_stopped" as const,
      expected: "Sandbox stopped while this turn was running.",
    },
    { cause: "process_dead" as const, expected: STALL_ALERT_TEXT },
  ])("finalizing with cause $cause reports its own alert", async (scenario) => {
    const { t, placeholderMessageId, turnId } = await createSessionFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(turnId, {
        state: "running",
        leaseExpiresAt: Date.now() - 1,
      });
    });

    vi.useFakeTimers();
    try {
      await t.mutation(internal.turns.finalizeExpired, {
        turnId,
        cause: scenario.cause,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    const rows = await t.run(async (ctx) => ({
      turn: await ctx.db.get(turnId),
      placeholder: await ctx.db.get(placeholderMessageId),
    }));
    expect(rows.turn?.open).toBe(false);
    expect(rows.turn?.error).toBe(scenario.expected);
    expect(rows.placeholder?.content).toBe(scenario.expected);
  });

  test("a streaming touch within 2s does not rewrite lastUpdatedAt", async () => {
    const { t, chatId } = await createSessionFixture();
    const entityId = String(chatId);
    const stamped = await t.run(async (ctx) => {
      const lastUpdatedAt = Date.now();
      await ctx.db.insert("streamingActivity", {
        entityId,
        currentActivity: "[]",
        currentContent: "",
        lastUpdatedAt,
      });
      return lastUpdatedAt;
    });

    await t.mutation(internal.streaming.internalTouch, { entityId });

    const after = await t.run(
      async (ctx) =>
        await ctx.db
          .query("streamingActivity")
          .withIndex("by_entity", (q) => q.eq("entityId", entityId))
          .unique(),
    );
    expect(after?.lastUpdatedAt).toBe(stamped);
  });
});

describe("task chat turns share the session turn lifecycle", () => {
  test("renewal fences an older lease generation", async () => {
    const { t, turnId, streamingEntityId } = await createTaskChatFixture();
    const claim = async () =>
      await t.run(async (ctx) => {
        const turn = await ctx.db.get(turnId);
        if (!turn) throw new Error("missing turn");
        return (await acquireTurnLease(ctx, turn, "running"))?.leaseGeneration;
      });
    const renew = async (leaseGeneration: number) =>
      await t.run(
        async (ctx) =>
          await renewTurnLease(ctx, {
            turnId: String(turnId),
            leaseGeneration,
            streamingEntityId,
          }),
      );

    expect(await claim()).toBe(1);
    expect(await renew(1)).toMatchObject({ status: "renewed" });
    expect(await claim()).toBe(2);
    expect(await renew(1)).toEqual({
      status: "terminal",
      reason: "superseded",
    });
    expect(await renew(2)).toMatchObject({ status: "renewed" });
  });

  test("an expired task turn finalises through the task adapter", async () => {
    const { t, taskId, placeholderMessageId, turnId } =
      await createTaskChatFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(turnId, {
        state: "running",
        leaseExpiresAt: Date.now() - 1,
      });
    });

    // finalizeExpired schedules the one-shot stall retry (decision 4: every
    // chat has it); drain it inside the test so it never fires against a
    // later test's database.
    vi.useFakeTimers();
    let scheduled: string[] = [];
    try {
      await t.mutation(internal.turns.finalizeExpired, {
        turnId,
        cause: "process_dead",
      });
      scheduled = await t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).map(
          (job) => job.name,
        ),
      );
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    const rows = await t.run(async (ctx) => ({
      turn: await ctx.db.get(turnId),
      task: await ctx.db.get(taskId),
      placeholder: await ctx.db.get(placeholderMessageId),
    }));
    expect(rows.turn?.open).toBe(false);
    expect(rows.turn?.error).toBe(STALL_ALERT_TEXT);
    expect(rows.placeholder?.content).toBe(STALL_ALERT_TEXT);
    expect(rows.task?.syntheticTurnMessageId).toBeUndefined();
    expect(scheduled).toEqual(["agentTaskChatWorkflow:retryEmptyStalledTurn"]);
  });

  test("the legacy heartbeat teardown closes the turn it tears down", async () => {
    // Both stall systems run until Phase 3. Whichever fires first must leave
    // nothing for the other, or the chat gets a second stall alert.
    const { t, taskId, turnId } = await createTaskChatFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(turnId, { workflowId: "chat-workflow" });
      await ctx.db.patch(taskId, { activeChatWorkflowId: "chat-workflow" });
      const task = await ctx.db.get(taskId);
      if (!task) throw new Error("missing task");
      await finalizeStaleChatTurn(
        ctx,
        taskChatAdapter,
        taskId,
        task,
        "chat-workflow",
        { text: STALL_ALERT_TEXT },
        { sandboxStopped: true },
      );
    });

    const turn = await t.run(async (ctx) => await ctx.db.get(turnId));
    expect(turn?.open).toBe(false);
    expect(turn?.state).toBe("error");
    expect(turn?.error).toBe(STALL_ALERT_TEXT);
  });

  test("an open task turn makes the task busy, synthetic or not", async () => {
    const { t, repoId, taskId } = await createTaskChatFixture();
    const busy = await t.run(async (ctx) => {
      const open = await openChatEntityIdsForRepo(ctx.db, repoId);
      const task = await ctx.db.get(taskId);
      if (!task) throw new Error("missing task");
      // No `activeChatWorkflowId`: the open turn alone is the answer.
      return {
        open: [...open],
        task: taskIsExecuting(
          { ...task, activeChatWorkflowId: undefined },
          open,
        ),
      };
    });
    expect(busy.open).toEqual([String(taskId)]);
    expect(busy.task).toBe(true);
  });

  test("a closed task turn leaves the task idle once it is durable", async () => {
    const { t, taskId, turnId } = await createTaskChatFixture();
    const busy = await t.run(async (ctx) => {
      await ctx.db.patch(turnId, { open: false, state: "done" });
      await ctx.db.patch(taskId, {
        chatTurnLifecycleVersion: 2,
        // A stale pointer must not read as a live turn after the cutover.
        activeChatWorkflowId: "finished-workflow",
      });
      const task = await ctx.db.get(taskId);
      if (!task) throw new Error("missing task");
      return taskIsExecuting(task, new Set());
    });
    expect(busy).toBe(false);
  });

  test("the adapter is picked from the entity id's table", async () => {
    const { t, taskId } = await createTaskChatFixture();
    const kinds = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "eva",
        name: "adapter-pick",
        installationId: 1,
      });
      const sessionId = await ctx.db.insert("sessions", {
        repoId,
        userId,
        title: "Pick",
        status: "active",
      });
      const chatId = await ctx.db.insert("sessionChats", {
        sessionId,
        repoId,
        userId,
        title: "Main",
        number: 1,
        isMain: true,
      });
      const projectId = await ctx.db.insert("projects", {
        repoId,
        userId,
        title: "Pick",
        phase: "in_progress",
        rawInput: "pick",
        updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        taskId,
        status: "running",
        logs: [],
      });
      const visit = {
        chat: (adapter: { kind: string }) => adapter.kind,
        agent: (owner: { kind: string }) => owner.kind,
      };
      return [
        ...[chatId, taskId, projectId, runId, "not-an-id"].map((entityId) =>
          turnAdapterForEntity(ctx.db, { entityId }, visit),
        ),
        turnAdapterForEntity(
          ctx.db,
          { entityId: sessionId, lane: "summary" },
          visit,
        ),
        turnAdapterForEntity(
          ctx.db,
          { entityId: projectId, lane: "interview" },
          visit,
        ),
      ];
    });
    expect(kinds).toEqual([
      "sessionChat",
      "taskChat",
      "projectChat",
      "run",
      null,
      "summary",
      "interview",
    ]);
  });
});

/**
 * Quick-task runs own a durable turn: the lease fences their heartbeats, and
 * the reconciler stops a stalled run through `cleanUpStaleRun`.
 */
describe("quick-task run as a turn owner", () => {
  async function createRunTurnFixture() {
    const { t, repoId, taskId } = await createTaskChatFixture();
    const ids = await t.run(async (ctx) => {
      await ctx.db.patch(taskId, { status: "in_progress" });
      const runId = await ctx.db.insert("agentRuns", {
        taskId,
        repoId,
        status: "running",
        logs: [],
        startedAt: Date.now(),
      });
      const turnId = await openTurn(ctx, {
        entityId: runId,
        streamingEntityId: getTaskRunStreamingEntityId(runId),
        model: "claude:sonnet",
        repoId,
      });
      const turn = await ctx.db.get(turnId);
      if (turn) await acquireTurnLease(ctx, turn, "running");
      return { runId, turnId };
    });
    return { t, taskId, ...ids };
  }

  test("a run turn renews and fences like any other turn", async () => {
    const { t, runId, turnId } = await createRunTurnFixture();
    const verdicts = await t.run(async (ctx) => ({
      current: await renewTurnLease(ctx, {
        turnId,
        leaseGeneration: 1,
        streamingEntityId: getTaskRunStreamingEntityId(runId),
      }),
      old: await renewTurnLease(ctx, { turnId, leaseGeneration: 0 }),
    }));
    expect(verdicts.current.status).toBe("renewed");
    expect(verdicts.old).toEqual({ status: "terminal", reason: "superseded" });
  });

  test("an expired run turn stops the run with the old watchdog text", async () => {
    vi.useFakeTimers();
    try {
      const { t, runId, turnId, taskId } = await createRunTurnFixture();
      await t.run(async (ctx) => {
        await ctx.db.patch(turnId, { leaseExpiresAt: Date.now() - 1 });
      });
      await t.mutation(internal.turns.finalizeExpired, {
        turnId,
        cause: "process_dead",
      });
      const after = await t.run(async (ctx) => ({
        turn: await ctx.db.get(turnId),
        run: await ctx.db.get(runId),
        task: await ctx.db.get(taskId),
      }));
      expect(after.turn?.open).toBe(false);
      expect(after.turn?.state).toBe("error");
      expect(after.run?.status).toBe("error");
      expect(after.run?.exitReason).toBe("watchdog_killed");
      expect(after.run?.error).toMatch(/^Run killed by watchdog: no heartbeat/);
      expect(after.task?.status).toBe("todo");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A one-shot agent on a chat row (session summary, project interview) has a
 * lane, so its turn never reads as, or is superseded by, the chat's turn.
 */
describe("lane turns stay apart from chat turns", () => {
  test("a summary turn is not the session's chat turn", async () => {
    const { t, sessionId, chatId } = await createSessionFixture();
    const result = await t.run(async (ctx) => {
      const session = await ctx.db.get(sessionId);
      if (!session) throw new Error("missing session");
      const chatTurn = await findOpenTurn(ctx, chatId);
      const summaryTurnId = await openTurn(ctx, {
        entityId: sessionId,
        lane: "summary",
        streamingEntityId: sessionSummaryStreamingEntityId(sessionId),
        model: "claude:sonnet",
        repoId: session.repoId,
      });
      return {
        chatTurnId: chatTurn?._id,
        chatTurnAfter: (await findOpenTurn(ctx, chatId))?._id,
        summaryTurn: await findOpenTurn(ctx, sessionId, "summary"),
        summaryTurnId,
        hasChatTurn: await hasOpenChatTurn(ctx.db, sessionId),
      };
    });
    // Opening the summary turn did not supersede the chat turn.
    expect(result.chatTurnAfter).toBe(result.chatTurnId);
    expect(result.summaryTurn?._id).toBe(result.summaryTurnId);
    expect(result.summaryTurn?.lane).toBe("summary");
    expect(result.hasChatTurn).toBe(result.chatTurnId !== undefined);
  });
});

/**
 * Heartbeats used to patch `leaseExpiresAt` on every 150ms flush, which was an
 * OCC storm against the overlapping heartbeat (fix c708f9ddd). A renewal now
 * writes only when the phase moved or the lease is more than half gone.
 */
describe("turn lease renewal writes", () => {
  const now = 1_000_000;
  const durationMs = 120_000;

  test("a phase change always writes", () => {
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "running",
        nextState: "finalizing",
        leaseExpiresAt: now + durationMs,
        now,
        durationMs,
      }),
    ).toBe(true);
  });

  test("a lease with more than half its life left is a no-op", () => {
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "running",
        nextState: "running",
        leaseExpiresAt: now + durationMs / 2 + 1,
        now,
        durationMs,
      }),
    ).toBe(false);
  });

  test("a lease past its halfway point is renewed", () => {
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "running",
        nextState: "running",
        leaseExpiresAt: now + durationMs / 2,
        now,
        durationMs,
      }),
    ).toBe(true);
  });

  test("an expired lease is renewed", () => {
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "running",
        nextState: "running",
        leaseExpiresAt: now - 1,
        now,
        durationMs,
      }),
    ).toBe(true);
  });

  test("a state with no lease duration always writes", () => {
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "running",
        nextState: "running",
        leaseExpiresAt: now + durationMs,
        now,
        durationMs: 0,
      }),
    ).toBe(true);
  });
});

describe("turn lifecycle rollout", () => {
  test("legacy execution fields are consulted only before the durable cutover", () => {
    expect(
      isLegacySessionExecuting({
        activeWorkflowId: "legacy-workflow",
        syntheticTurnMessageId: undefined,
        turnLifecycleVersion: undefined,
      }),
    ).toBe(true);
    expect(
      isLegacySessionExecuting({
        activeWorkflowId: "stale-workflow",
        syntheticTurnMessageId: undefined,
        turnLifecycleVersion: 2,
      }),
    ).toBe(false);
  });

  test("the shared completion helper carries the current lease into fatal payloads", () => {
    beginTurnOwnership("claim", { turnId: "turn-1", leaseGeneration: 7 });
    const args: JsonObject = { success: false };
    appendCurrentTurnLease(args);
    endTurnOwnership();
    expect(args).toEqual({
      success: false,
      turnId: "turn-1",
      leaseGeneration: 7,
    });
  });

  test("an authenticated fallback heartbeat propagates a terminal fence", () => {
    const lease = { turnId: "turn-1", leaseGeneration: 7 };
    beginTurnOwnership("claim", lease);
    expect(
      noteHeartbeatResponse(
        {
          status: "success",
          value: {
            accepted: false,
            lease: { status: "terminal", reason: "superseded" },
          },
        },
        lease,
      ),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("superseded");
    endTurnOwnership();
  });
});
