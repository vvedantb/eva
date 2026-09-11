import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  acquireTurnLease,
  graceExpiredTurnLease,
  openSessionTurn,
  renewTurnLease,
} from "../convex/_chat/turnStore";
import { shouldWriteTurnLeaseRenewal } from "../convex/_chat/turnLease";
import { isLegacySessionExecuting } from "../convex/_chat/turnProjection";
import { rollbackQueuedSessionStart } from "../convex/_queues/helpers";
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
      prompt: "hi",
      model: "claude:sonnet",
      repoId,
    });
    return { sessionId, placeholderMessageId, turnId };
  });
  return { t, ...ids };
}

describe("turn lifecycle integration", () => {
  test("opening the first durable Turn permanently marks the session cutover", async () => {
    const { t, sessionId } = await createSessionFixture();
    const session = await t.run(async (ctx) => await ctx.db.get(sessionId));
    expect(session?.turnLifecycleVersion).toBe(2);
  });

  test("an unfenced legacy heartbeat cannot overwrite a durable Turn", async () => {
    const { t, sessionId } = await createSessionFixture();
    await t.run(async (ctx) => {
      await ctx.db.insert("streamingActivity", {
        entityId: String(sessionId),
        currentActivity: "old activity",
        currentContent: "old content",
        lastUpdatedAt: 1,
      });
    });

    const accepted = await t.mutation(internal.turns.legacyHeartbeat, {
      entityId: String(sessionId),
      touchOnly: false,
      currentActivity: "stale activity",
      currentContent: "stale content",
    });

    expect(accepted).toBe(false);
    const streaming = await t.run(async (ctx) =>
      await ctx.db
        .query("streamingActivity")
        .withIndex("by_entity", (q) => q.eq("entityId", String(sessionId)))
        .unique(),
    );
    expect(streaming?.currentActivity).toBe("old activity");
    expect(streaming?.currentContent).toBe("old content");
    expect(streaming?.lastUpdatedAt).toBe(1);
  });

  test("queued workflow start rollback closes its Turn and removes its placeholder", async () => {
    const { t, sessionId, placeholderMessageId, turnId } =
      await createSessionFixture();

    await t.run(
      async (ctx) =>
        await rollbackQueuedSessionStart(ctx, {
          sessionId,
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
        const turn = await ctx.db.get(turnId);
        if (!turn) throw new Error("missing turn");
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
      const claimed = await ctx.db.get(turnId);
      if (!claimed) throw new Error("missing turn");
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

    await t.mutation(internal.turns.finalizeExpired, {
      turnId,
      cause: "silent_timeout",
    });

    const rows = await t.run(async (ctx) => ({
      turn: await ctx.db.get(turnId),
      placeholder: await ctx.db.get(placeholderMessageId),
    }));
    expect(rows.turn?.open).toBe(false);
    expect(rows.turn?.state).toBe("error");
    expect(rows.placeholder?.content).toContain("Turn stalled");
  });

  test("a streaming touch within 2s does not rewrite lastUpdatedAt", async () => {
    const { t, sessionId } = await createSessionFixture();
    const entityId = String(sessionId);
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
    beginTurnOwnership("claim", { turnId: "turn-1", leaseGeneration: 7 });
    expect(
      noteHeartbeatResponse({
        status: "success",
        value: {
          accepted: false,
          lease: { status: "terminal", reason: "superseded" },
        },
      }),
    ).toBe(true);
    expect(getLeaseTerminalReason()).toBe("superseded");
    endTurnOwnership();
  });
});
