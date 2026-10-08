import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  acquireTurnLease,
  listOpenSessionTurns,
  openChatTurn,
  renewTurnLease,
} from "../convex/_chat/turnStore";
import { shouldWriteTurnLeaseRenewal } from "../convex/_chat/turnLease";
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

const CLERK_ID = "clerk|turn-lifecycle";

/** Loading the session module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

/** A session with its Main chat and one staged turn on that chat. */
async function createChatFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "turn-lifecycle-test",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Lifecycle test",
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
    const placeholderMessageId = await ctx.db.insert("messages", {
      parentId: chatId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    const turnId = await openChatTurn(ctx, {
      chatId,
      sessionId,
      streamingEntityId: String(chatId),
      placeholderMessageId,
      prompt: "hi",
      model: "claude:sonnet",
      repoId,
    });
    return { repoId, sessionId, chatId, placeholderMessageId, turnId };
  });
  return { t, ...ids };
}

describe("turn lifecycle integration", () => {
  test("an open chat Turn carries its session, and that is what marks the session executing", async () => {
    // No per-session version bridge any more: the sidebar's executing state
    // is derived purely from open turns grouped by their `sessionId`.
    const { t, repoId, sessionId, chatId, turnId } = await createChatFixture();

    const turn = await t.run(async (ctx) => await ctx.db.get(turnId));
    expect(turn?.surface).toBe("sessionChat");
    expect(turn?.entityId).toBe(String(chatId));
    expect(turn?.sessionId).toBe(sessionId);

    const open = await t.run(
      async (ctx) => await listOpenSessionTurns(ctx, sessionId),
    );
    expect(open.map((item) => item._id)).toEqual([turnId]);

    const asUser = t.withIdentity({ subject: CLERK_ID });
    const before = await asUser.query(api.sessions.list, { repoId });
    expect(before.map((item) => [item._id, item.isExecuting, item.runningChats]))
      .toEqual([[sessionId, true, 1]]);

    await t.run(async (ctx) => {
      await ctx.db.patch(turnId, { open: false, state: "done" });
    });
    const after = await asUser.query(api.sessions.list, { repoId });
    expect(after.map((item) => [item.isExecuting, item.runningChats])).toEqual([
      [false, 0],
    ]);
  }, TIMEOUT_MS);

  test("an unfenced legacy heartbeat cannot overwrite a durable Turn", async () => {
    const { t, chatId } = await createChatFixture();
    await t.run(async (ctx) => {
      await ctx.db.insert("streamingActivity", {
        entityId: String(chatId),
        currentActivity: "old activity",
        currentContent: "old content",
        lastUpdatedAt: 1,
      });
    });

    const accepted = await t.mutation(internal.turns.legacyHeartbeat, {
      entityId: String(chatId),
      touchOnly: false,
      currentActivity: "stale activity",
      currentContent: "stale content",
    });

    expect(accepted).toBe(false);
    const streaming = await t.run(async (ctx) =>
      await ctx.db
        .query("streamingActivity")
        .withIndex("by_entity", (q) => q.eq("entityId", String(chatId)))
        .unique(),
    );
    expect(streaming?.currentActivity).toBe("old activity");
    expect(streaming?.currentContent).toBe("old content");
    expect(streaming?.lastUpdatedAt).toBe(1);
  });

  test("queued workflow start rollback closes its Turn and removes its placeholder", async () => {
    const { t, chatId, placeholderMessageId, turnId } =
      await createChatFixture();

    await t.run(
      async (ctx) =>
        await rollbackQueuedSessionStart(ctx, {
          chatId,
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
    const { t, turnId } = await createChatFixture();
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
    const { t, chatId, turnId } = await createChatFixture();
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
          turnId: String(chatId),
          leaseGeneration: 0,
        }),
    );
    expect(unknown).toEqual({ status: "terminal", reason: "unknown_turn" });
  });

  test("a fresh running lease is not rewritten by a second heartbeat", async () => {
    const { t, turnId } = await createChatFixture();
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

  test("a streaming touch within 2s does not rewrite lastUpdatedAt", async () => {
    const { t, chatId } = await createChatFixture();
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

// The `isLegacySessionExecuting` rollout bridge was deleted with the chat
// refactor: chats are always durable, so there is no pre-cutover state left
// to consult. The first integration test above pins what replaced it.
describe("turn lifecycle callback lease plumbing", () => {
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
