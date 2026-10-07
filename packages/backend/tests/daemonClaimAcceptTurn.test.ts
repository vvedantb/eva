import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  acquireTurnLease,
  closeTurn,
  openChatTurn,
  openSessionTurn,
} from "../convex/_chat/turnStore";
import { TURN_RUNNING_LEASE_MS } from "../convex/_chat/turnLease";

/**
 * `claimPendingTurn` hands a staged prompt to the daemon AND takes the turn's
 * 2-minute running lease in the same mutation. A daemon that claims while it
 * is still finalizing the previous turn cannot heartbeat that lease, so two
 * minutes later the stall watchdog closes the turn and the prompt is gone with
 * an empty assistant bubble (fix b261c3394).
 *
 * The daemon therefore polls with `acceptTurn: false` until idle: cancel and
 * stop-task drains still have to happen on those polls — the daemon has no
 * other channel for an interrupt — while the prompt stays staged.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the session-workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|daemon-poller";
const MODEL = "claude:sonnet";
const PROMPT = "list the 38 task names";

async function createStagedTurnFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "claim-accept-turn-test",
      installationId: 1,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Claim gate test",
      status: "active",
    });
    const placeholderMessageId = await ctx.db.insert("messages", {
      parentId: sessionId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    const turnId = await openSessionTurn(ctx, {
      sessionId,
      streamingEntityId: String(sessionId),
      placeholderMessageId,
      prompt: PROMPT,
      model: MODEL,
      repoId,
    });
    const pendingTurn = {
      prompt: PROMPT,
      requestedAt: Date.now(),
      turnId,
      model: MODEL,
    } as const;
    await ctx.db.patch(sessionId, { pendingTurn });
    await ctx.db.insert("sessionDaemonStates", {
      sessionId,
      repoId,
      userId,
      pendingTurn,
      pendingTaskStops: ["toolu_stop_me"],
      cancelRequestedAt: Date.now(),
    });
    return { sessionId, turnId };
  });
  return { t: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

async function readTurnState(
  t: Awaited<ReturnType<typeof createStagedTurnFixture>>["t"],
  ids: { sessionId: string; turnId: string },
) {
  return await t.run(async (ctx) => {
    const turnId = ctx.db.normalizeId("turns", ids.turnId);
    const sessionId = ctx.db.normalizeId("sessions", ids.sessionId);
    if (!turnId || !sessionId) throw new Error("missing fixture ids");
    const turn = await ctx.db.get(turnId);
    const session = await ctx.db.get(sessionId);
    const daemonState = await ctx.db
      .query("sessionDaemonStates")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    return {
      state: turn?.state,
      leaseGeneration: turn?.leaseGeneration,
      leaseExpiresAt: turn?.leaseExpiresAt,
      sessionPendingPrompt: session?.pendingTurn?.prompt,
      daemonPendingPrompt: daemonState?.pendingTurn?.prompt,
      cancelRequestedAt: daemonState?.cancelRequestedAt,
      pendingTaskStops: daemonState?.pendingTaskStops,
    };
  });
}

describe("a daemon only takes the running lease when it is idle", () => {
  test(
    "a busy poll leaves the prompt staged and the lease untaken",
    async () => {
      const { t, sessionId, turnId } = await createStagedTurnFixture();

      const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
        sessionId,
        model: MODEL,
        acceptTurn: false,
      });

      expect(claim.prompt).toBeNull();
      const after = await readTurnState(t, { sessionId, turnId });
      // Still "staged" on generation 0: nothing acquired a lease it cannot renew.
      expect(after.state).toBe("staged");
      expect(after.leaseGeneration).toBe(0);
      expect(after.daemonPendingPrompt).toBe(PROMPT);
      expect(after.sessionPendingPrompt).toBe(PROMPT);
    },
    TIMEOUT_MS,
  );

  test(
    "a busy poll still drains the interrupt and stop-task signals",
    async () => {
      // The daemon learns about a cancel only from this mutation, so gating the
      // drain on the turn handover would strand a mid-turn interrupt forever.
      const { t, sessionId, turnId } = await createStagedTurnFixture();

      const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
        sessionId,
        model: MODEL,
        acceptTurn: false,
      });

      expect(claim.cancelRequested).toBe(true);
      expect(claim.stopTaskToolUseIds).toEqual(["toolu_stop_me"]);
      const after = await readTurnState(t, { sessionId, turnId });
      expect(after.cancelRequestedAt).toBeUndefined();
      expect(after.pendingTaskStops).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "the next idle poll claims the same prompt and takes the lease",
    async () => {
      const { t, sessionId, turnId } = await createStagedTurnFixture();

      await t.mutation(api._sessions.workflow.claimPendingTurn, {
        sessionId,
        model: MODEL,
        acceptTurn: false,
      });
      const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
        sessionId,
        model: MODEL,
        acceptTurn: true,
      });

      expect(claim.prompt).toBe(PROMPT);
      expect(claim.turnLifecycle).toBe("durable");
      const after = await readTurnState(t, { sessionId, turnId });
      expect(after.state).toBe("running");
      expect(after.leaseGeneration).toBe(1);
      // Handed over exactly once — a second daemon must not re-execute it.
      expect(after.daemonPendingPrompt).toBeUndefined();
      expect(after.sessionPendingPrompt).toBeUndefined();
      expect(after.leaseExpiresAt).toBeLessThanOrEqual(
        Date.now() + TURN_RUNNING_LEASE_MS,
      );
    },
    TIMEOUT_MS,
  );

  test(
    "a sandbox too old to send the flag still gets its turn",
    async () => {
      // `acceptTurn` is optional and only `false` withholds: a deployed daemon
      // that predates the flag keeps the previous behaviour rather than idling
      // on a prompt it never claims.
      const { t, sessionId, turnId } = await createStagedTurnFixture();

      const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
        sessionId,
        model: MODEL,
      });

      expect(claim.prompt).toBe(PROMPT);
      const after = await readTurnState(t, { sessionId, turnId });
      expect(after.state).toBe("running");
    },
    TIMEOUT_MS,
  );
});

/**
 * Task and project chats stage a durable turn too. Unlike sessions, a daemon
 * that predates `acceptTurn` gets an empty claim there: it cannot heartbeat a
 * lease, and prewarm replaces it with a daemon that can (decision 1).
 */
type ChatSurface = "task" | "project";

async function createStagedChatTurnFixture(surface: ChatSurface) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "chat-claim-test",
      installationId: 1,
    });
    const now = Date.now();
    const entity =
      surface === "task"
        ? {
            surface: "task" as const,
            id: await ctx.db.insert("agentTasks", {
              repoId,
              title: "Chat claim",
              status: "code_review",
              createdAt: now,
              updatedAt: now,
              createdBy: userId,
              activeChatWorkflowId: "chat-workflow",
            }),
          }
        : {
            surface: "project" as const,
            id: await ctx.db.insert("projects", {
              repoId,
              userId,
              title: "Chat claim",
              phase: "in_progress",
              rawInput: "chat claim",
              updatedAt: now,
              activeChatWorkflowId: "chat-workflow",
            }),
          };
    const entityId = entity.id;
    const placeholderMessageId = await ctx.db.insert("messages", {
      parentId: entityId,
      role: "assistant",
      content: "",
      timestamp: now,
    });
    const turnId = await openChatTurn(ctx, {
      entityId,
      streamingEntityId: `${surface}-chat-${entityId}`,
      placeholderMessageId,
      prompt: PROMPT,
      model: MODEL,
      repoId,
    });
    await ctx.db.patch(entityId, {
      pendingTurn: { prompt: PROMPT, requestedAt: now, turnId, model: MODEL },
    });
    return { entity, entityId, turnId };
  });
  const authed = t.withIdentity({ subject: CLERK_ID });
  const claim = (acceptTurn?: boolean) =>
    ids.entity.surface === "task"
      ? authed.mutation(api._chat.taskChatDaemon.claimPendingTurn, {
          taskId: ids.entity.id,
          model: MODEL,
          acceptTurn,
        })
      : authed.mutation(api._chat.projectChatDaemon.claimPendingTurn, {
          projectId: ids.entity.id,
          model: MODEL,
          acceptTurn,
        });
  const read = () =>
    t.run(async (ctx) => {
      const turn = await ctx.db.get(ids.turnId);
      const entity = await ctx.db.get(ids.entityId);
      return {
        state: turn?.state,
        open: turn?.open,
        leaseGeneration: turn?.leaseGeneration,
        pendingPrompt: entity?.pendingTurn?.prompt,
        lifecycleVersion: entity?.chatTurnLifecycleVersion,
      };
    });
  return { t, ...ids, claim, read };
}

describe.each<ChatSurface>(["task", "project"])(
  "a %s chat claim decides durable or empty by acceptTurn",
  (surface) => {
    test(
      "staging marks the entity as a durable-turn user",
      async () => {
        const { read } = await createStagedChatTurnFixture(surface);
        expect((await read()).lifecycleVersion).toBe(2);
      },
      TIMEOUT_MS,
    );

    test(
      "an idle daemon takes the lease and gets a durable claim",
      async () => {
        const { claim, read, turnId } =
          await createStagedChatTurnFixture(surface);

        const result = await claim(true);

        expect(result.prompt).toBe(PROMPT);
        expect(result.turnLifecycle).toBe("durable");
        if (result.turnLifecycle !== "durable") return;
        expect(result.turnId).toBe(turnId);
        expect(result.leaseGeneration).toBe(1);
        const after = await read();
        expect(after.state).toBe("running");
        expect(after.pendingPrompt).toBeUndefined();
      },
      TIMEOUT_MS,
    );

    test(
      "a daemon without acceptTurn gets an empty claim and the turn stays staged",
      async () => {
        const { claim, read } = await createStagedChatTurnFixture(surface);

        const result = await claim(undefined);

        expect(result.prompt).toBeNull();
        const after = await read();
        expect(after.state).toBe("staged");
        expect(after.leaseGeneration).toBe(0);
        expect(after.pendingPrompt).toBe(PROMPT);
      },
      TIMEOUT_MS,
    );

    test(
      "a busy poll leaves the durable turn staged",
      async () => {
        const { claim, read } = await createStagedChatTurnFixture(surface);

        expect((await claim(false)).prompt).toBeNull();
        expect((await read()).state).toBe("staged");
      },
      TIMEOUT_MS,
    );

    test(
      "a closed turn's staged prompt is dropped, not handed out",
      async () => {
        const { t, claim, read, turnId } =
          await createStagedChatTurnFixture(surface);
        await t.run(async (ctx) => {
          const turn = await ctx.db.get(turnId);
          if (turn) await closeTurn(ctx, turn, "cancelled");
        });

        expect((await claim(true)).prompt).toBeNull();
        expect((await read()).pendingPrompt).toBeUndefined();
      },
      TIMEOUT_MS,
    );

    test(
      "a second daemon cannot claim a turn that is already running",
      async () => {
        const { t, claim, read, turnId } =
          await createStagedChatTurnFixture(surface);
        await t.run(async (ctx) => {
          const turn = await ctx.db.get(turnId);
          if (turn) await acquireTurnLease(ctx, turn, "running");
        });

        expect((await claim(true)).prompt).toBeNull();
        const after = await read();
        expect(after.leaseGeneration).toBe(1);
        expect(after.pendingPrompt).toBeUndefined();
      },
      TIMEOUT_MS,
    );
  },
);
