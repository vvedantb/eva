import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { findOpenTurn } from "../convex/_chat/turnStore";
import { modules } from "./_helpers/convexModules";

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
        { role: "user", content: "fix the header" },
        { role: "assistant", content: "" },
      ]);

      const outcome = await f.t.mutation(
        internal._sessions.execution.sendFromMcp,
        {
          clerkUserId: CLERK_ID,
          chatId,
          message: BURST_MESSAGE,
          model: "claude:sonnet",
          sentViaOrchestrator: true,
        },
      );

      expect(outcome).toBe("queued");
      expect(await chatState(f.t, chatId)).toEqual({
        queued: [BURST_MESSAGE],
        userRows: ["fix the header"],
      });
      const turn = await f.t.run((ctx) => findOpenTurn(ctx, chatId));
      expect(turn?.workflowId).toBe("wf-first-send");
    },
    TIMEOUT_MS,
  );
});
