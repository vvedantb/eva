import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { findOpenTurn } from "../convex/_chat/turnStore";

/**
 * The composer picks send or queue from its own subscription, so a burst of
 * sends can all reach `startExecute` before it sees the first turn. Each one
 * used to start, so two turns ran at once. A send that lands behind a running
 * turn must queue instead, and its composer-stored user row must go (the
 * dequeue inserts its own).
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|send-burst";
const BURST_MESSAGE = "and also rename the button";

async function baseFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    return { userId, repoId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof baseFixture>>;
type Row = { role: "user" | "assistant"; content: string; finished?: true };

/** A session chat with a running turn and `rows` stored oldest first. */
function busySessionChat(f: Fixture, rows: Row[]) {
  return f.t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId: f.repoId,
      userId: f.userId,
      title: "Send burst",
      status: "active",
      numId: 1,
    });
    const id = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId: f.repoId,
      userId: f.userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    const start = Date.now();
    await ctx.db.insert("turns", {
      entityId: id,
      sessionId,
      streamingEntityId: String(id),
      state: "running",
      open: true,
      turnStartedAt: start,
      leaseExpiresAt: start + 120_000,
      leaseGeneration: 1,
      model: "claude:sonnet",
      repoId: f.repoId,
      workflowId: "wf-first-send",
    });
    for (const [index, row] of rows.entries()) {
      await ctx.db.insert("messages", {
        parentId: id,
        role: row.role,
        content: row.content,
        timestamp: start + index,
        ...(row.finished ? { finishedAt: start + index } : {}),
      });
    }
    return id;
  });
}

function chatState(
  t: Fixture["t"],
  parentId: Id<"sessionChats">,
) {
  return t.run(async (ctx) => {
    const queued = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", parentId))
      .collect();
    const userRows = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .filter((q) => q.eq(q.field("role"), "user"))
      .collect();
    return {
      queued: queued.map((row) => row.content),
      userRows: userRows.map((row) => row.content),
    };
  });
}

describe("a send that lands behind a running turn", () => {
  test(
    "queues on a session chat instead of starting a second turn",
    async () => {
      const f = await baseFixture();
      const chatId = await busySessionChat(f, [
        { role: "user", content: BURST_MESSAGE },
      ]);

      const outcome = await f.asUser.mutation(
        api.sessionWorkflow.startExecute,
        { chatId, message: BURST_MESSAGE, model: "claude:sonnet" },
      );

      expect(outcome).toBe("queued");
      expect(await chatState(f.t, chatId)).toEqual({
        queued: [BURST_MESSAGE],
        userRows: [],
      });
      const turn = await f.t.run((ctx) => findOpenTurn(ctx, chatId));
      expect(turn?.workflowId).toBe("wf-first-send");
    },
    TIMEOUT_MS,
  );

  test(
    "drops its row even when the first turn's placeholder is newer",
    async () => {
      // Both composer rows land, then the first send's turn inserts its
      // placeholder, so the burst row is no longer the chat's newest row.
      const f = await baseFixture();
      const chatId = await busySessionChat(f, [
        { role: "user", content: "fix the header" },
        { role: "user", content: BURST_MESSAGE },
        { role: "assistant", content: "" },
      ]);

      await f.asUser.mutation(api.sessionWorkflow.startExecute, {
        chatId,
        message: BURST_MESSAGE,
        model: "claude:sonnet",
      });

      expect(await chatState(f.t, chatId)).toEqual({
        queued: [BURST_MESSAGE],
        userRows: ["fix the header"],
      });
    },
    TIMEOUT_MS,
  );

  test(
    "keeps the same prompt from an earlier, finished turn",
    async () => {
      const f = await baseFixture();
      const chatId = await busySessionChat(f, [
        { role: "user", content: BURST_MESSAGE },
        { role: "assistant", content: "Renamed.", finished: true },
        { role: "user", content: "fix the header" },
        { role: "assistant", content: "" },
      ]);

      await f.asUser.mutation(api.sessionWorkflow.startExecute, {
        chatId,
        message: BURST_MESSAGE,
        model: "claude:sonnet",
      });

      expect(await chatState(f.t, chatId)).toEqual({
        queued: [BURST_MESSAGE],
        userRows: [BURST_MESSAGE, "fix the header"],
      });
    },
    TIMEOUT_MS,
  );
});
