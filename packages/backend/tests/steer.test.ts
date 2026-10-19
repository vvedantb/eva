import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { decideSteerDelivery } from "../convex/_chat/steer";

/**
 * Steer sends a queued message into the running turn. Claude and Codex take
 * it natively through the daemon claim; the row must never be lost or sent
 * twice: a delivered row is deleted, a rejected one stays at the front of the
 * queue so it runs as the next turn.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|steer-test";
const MODEL = "claude:sonnet";

describe("decideSteerDelivery", () => {
  const base = {
    hasActiveTurn: true,
    isBusy: false,
    runningModel: MODEL,
    steerModel: MODEL,
    hasAttachments: false,
  };

  test("Claude and Codex steer natively on the running model", () => {
    expect(decideSteerDelivery(base)).toBe("native");
    expect(
      decideSteerDelivery({
        ...base,
        runningModel: "codex:gpt-5.5",
        steerModel: "codex:gpt-5.5",
      }),
    ).toBe("native");
  });

  test("Cursor and OpenCode interrupt and resend", () => {
    for (const model of ["cursor:grok-4.7", "opencode:openai/gpt-5.6-sol"]) {
      expect(
        decideSteerDelivery({ ...base, runningModel: model, steerModel: model }),
      ).toBe("interrupt");
    }
  });

  test("a model switch or an attachment interrupts", () => {
    expect(
      decideSteerDelivery({ ...base, steerModel: "codex:gpt-5.5" }),
    ).toBe("interrupt");
    expect(decideSteerDelivery({ ...base, hasAttachments: true })).toBe(
      "interrupt",
    );
  });

  test("an idle chat just sends; a synthetic turn is interrupted", () => {
    expect(decideSteerDelivery({ ...base, hasActiveTurn: false })).toBe(
      "send",
    );
    expect(
      decideSteerDelivery({ ...base, hasActiveTurn: false, isBusy: true }),
    ).toBe("interrupt");
  });
});

async function createRunningChatFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "steer-test",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Steer test",
      status: "active",
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
      activeWorkflowId: "wf-running",
      lastModel: MODEL,
    });
    const earlierId = await ctx.db.insert("queuedMessages", {
      parentId: chatId,
      content: "queued first",
      createdAt: 1,
      order: 1,
      userId,
      model: MODEL,
    });
    const steerId = await ctx.db.insert("queuedMessages", {
      parentId: chatId,
      content: "use the other API",
      createdAt: 2,
      order: 2,
      userId,
      model: MODEL,
    });
    return { chatId, earlierId, steerId };
  });
  return { t: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof createRunningChatFixture>>;

async function readState(fixture: Fixture) {
  return await fixture.t.run(async (ctx) => {
    const chat = await ctx.db.get(fixture.chatId);
    const queue = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) =>
        q.eq("parentId", fixture.chatId),
      )
      .order("asc")
      .collect();
    return {
      steerRequestedAt: chat?.steerRequestedAt,
      queue: queue.map((row) => ({ id: row._id, steer: row.steer })),
    };
  });
}

describe("native steer through the daemon claim", () => {
  test(
    "requests, hands over once, and deletes the row on a delivered ack",
    async () => {
      const fixture = await createRunningChatFixture();
      const { t, chatId, earlierId, steerId } = fixture;

      await t.mutation(api.queuedMessages.steer, { id: steerId });
      let state = await readState(fixture);
      expect(state.steerRequestedAt).toBeTypeOf("number");
      // Moved ahead of the earlier message, waiting for the daemon.
      expect(state.queue).toEqual([
        { id: steerId, steer: "requested" },
        { id: earlierId, steer: undefined },
      ]);

      // A daemon without a live turn does not take it.
      const busy = await t.mutation(api._sessions.workflow.claimPendingTurn, {
        chatId,
        model: MODEL,
        acceptTurn: false,
        acceptSteer: false,
      });
      expect(busy.steers).toEqual([]);

      const live = await t.mutation(api._sessions.workflow.claimPendingTurn, {
        chatId,
        model: MODEL,
        acceptTurn: false,
        acceptSteer: true,
      });
      expect(live.steers).toEqual([{ id: steerId, text: "use the other API" }]);
      state = await readState(fixture);
      expect(state.steerRequestedAt).toBeUndefined();
      expect(state.queue[0]).toEqual({ id: steerId, steer: "delivering" });

      // Handed over exactly once.
      const again = await t.mutation(api._sessions.workflow.claimPendingTurn, {
        chatId,
        model: MODEL,
        acceptTurn: false,
        acceptSteer: true,
      });
      expect(again.steers).toEqual([]);

      await t.mutation(api._sessions.workflow.claimPendingTurn, {
        chatId,
        model: MODEL,
        acceptTurn: false,
        acceptSteer: true,
        steerAcks: [{ id: steerId, delivered: true }],
      });
      state = await readState(fixture);
      expect(state.queue).toEqual([{ id: earlierId, steer: undefined }]);
    },
    TIMEOUT_MS,
  );

  test(
    "a rejected ack keeps the row at the front for the next turn",
    async () => {
      const fixture = await createRunningChatFixture();
      const { t, chatId, earlierId, steerId } = fixture;

      await t.mutation(api.queuedMessages.steer, { id: steerId });
      await t.mutation(api._sessions.workflow.claimPendingTurn, {
        chatId,
        model: MODEL,
        acceptTurn: false,
        acceptSteer: true,
      });
      await t.mutation(api._sessions.workflow.claimPendingTurn, {
        chatId,
        model: MODEL,
        acceptTurn: false,
        acceptSteer: false,
        steerAcks: [{ id: steerId, delivered: false }],
      });
      const state = await readState(fixture);
      expect(state.queue).toEqual([
        { id: steerId, steer: undefined },
        { id: earlierId, steer: undefined },
      ]);
    },
    TIMEOUT_MS,
  );
});
