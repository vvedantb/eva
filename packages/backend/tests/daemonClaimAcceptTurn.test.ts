import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { openChatTurn } from "../convex/_chat/turnStore";
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
 *
 * Everything the daemon reads and drains lives on the `sessionChats` row the
 * daemon belongs to; the session itself is not touched by a poll.
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
      prompt: PROMPT,
      model: MODEL,
      repoId,
    });
    await ctx.db.patch(chatId, {
      pendingTurn: {
        prompt: PROMPT,
        requestedAt: Date.now(),
        turnId,
        model: MODEL,
      },
      pendingTaskStops: ["toolu_stop_me"],
      cancelRequestedAt: Date.now(),
    });
    return { chatId, turnId };
  });
  return { t: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

async function readTurnState(
  t: Awaited<ReturnType<typeof createStagedTurnFixture>>["t"],
  ids: { chatId: string; turnId: string },
) {
  return await t.run(async (ctx) => {
    const turnId = ctx.db.normalizeId("turns", ids.turnId);
    const chatId = ctx.db.normalizeId("sessionChats", ids.chatId);
    if (!turnId || !chatId) throw new Error("missing fixture ids");
    const turn = await ctx.db.get(turnId);
    const chat = await ctx.db.get(chatId);
    return {
      state: turn?.state,
      leaseGeneration: turn?.leaseGeneration,
      leaseExpiresAt: turn?.leaseExpiresAt,
      pendingPrompt: chat?.pendingTurn?.prompt,
      cancelRequestedAt: chat?.cancelRequestedAt,
      pendingTaskStops: chat?.pendingTaskStops,
    };
  });
}

describe("a daemon only takes the running lease when it is idle", () => {
  test("a busy poll leaves the prompt staged and the lease untaken", async () => {
    const { t, chatId, turnId } = await createStagedTurnFixture();

    const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
      chatId,
      model: MODEL,
      acceptTurn: false,
    });

    expect(claim.prompt).toBeNull();
    const after = await readTurnState(t, { chatId, turnId });
    // Still "staged" on generation 0: nothing acquired a lease it cannot renew.
    expect(after.state).toBe("staged");
    expect(after.leaseGeneration).toBe(0);
    expect(after.pendingPrompt).toBe(PROMPT);
  }, TIMEOUT_MS);

  test("a busy poll still drains the interrupt and stop-task signals", async () => {
    // The daemon learns about a cancel only from this mutation, so gating the
    // drain on the turn handover would strand a mid-turn interrupt forever.
    const { t, chatId, turnId } = await createStagedTurnFixture();

    const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
      chatId,
      model: MODEL,
      acceptTurn: false,
    });

    expect(claim.cancelRequested).toBe(true);
    expect(claim.stopTaskToolUseIds).toEqual(["toolu_stop_me"]);
    const after = await readTurnState(t, { chatId, turnId });
    expect(after.cancelRequestedAt).toBeUndefined();
    expect(after.pendingTaskStops).toBeUndefined();
  }, TIMEOUT_MS);

  test("the next idle poll claims the same prompt and takes the lease", async () => {
    const { t, chatId, turnId } = await createStagedTurnFixture();

    await t.mutation(api._sessions.workflow.claimPendingTurn, {
      chatId,
      model: MODEL,
      acceptTurn: false,
    });
    const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
      chatId,
      model: MODEL,
      acceptTurn: true,
    });

    expect(claim.prompt).toBe(PROMPT);
    expect(claim.turnLifecycle).toBe("durable");
    const after = await readTurnState(t, { chatId, turnId });
    expect(after.state).toBe("running");
    expect(after.leaseGeneration).toBe(1);
    // Handed over exactly once — a second daemon must not re-execute it.
    expect(after.pendingPrompt).toBeUndefined();
    expect(after.leaseExpiresAt).toBeLessThanOrEqual(
      Date.now() + TURN_RUNNING_LEASE_MS,
    );
  }, TIMEOUT_MS);

  test("a sandbox too old to send the flag still gets its turn", async () => {
    // `acceptTurn` is optional and only `false` withholds: a deployed daemon
    // that predates the flag keeps the previous behaviour rather than idling
    // on a prompt it never claims.
    const { t, chatId, turnId } = await createStagedTurnFixture();

    const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
      chatId,
      model: MODEL,
    });

    expect(claim.prompt).toBe(PROMPT);
    const after = await readTurnState(t, { chatId, turnId });
    expect(after.state).toBe("running");
  }, TIMEOUT_MS);

  test("a session still setting up its sandbox withholds the turn", async () => {
    // The only session read on the claim path: once a turn is pending, the
    // setup gate keeps the prompt staged until the checkout is current.
    const { t, chatId, turnId } = await createStagedTurnFixture();
    await t.run(async (ctx) => {
      const id = ctx.db.normalizeId("sessionChats", chatId);
      if (!id) throw new Error("missing chat id");
      const chat = await ctx.db.get(id);
      if (!chat) throw new Error("missing chat");
      await ctx.db.patch(chat.sessionId, { sandboxSetupPending: true });
    });

    const claim = await t.mutation(api._sessions.workflow.claimPendingTurn, {
      chatId,
      model: MODEL,
      acceptTurn: true,
    });

    expect(claim.prompt).toBeNull();
    const after = await readTurnState(t, { chatId, turnId });
    expect(after.state).toBe("staged");
    expect(after.pendingPrompt).toBe(PROMPT);
  }, TIMEOUT_MS);
});
