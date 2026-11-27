import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";


const TIMEOUT_MS = 30_000;

const MINUTE_MS = 60 * 1000;

async function fixture(options: {
  sandboxStatus: "active" | "closed" | "starting" | "stopping";
  orphanAgentAgeMs?: number;
  deletedAccount?: boolean;
}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|runner" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    let providerAccountId: Id<"userProviderAccounts"> | undefined;
    if (options.deletedAccount) {
      providerAccountId = await ctx.db.insert("userProviderAccounts", {
        userId,
        provider: "claude",
        label: "Mine",
        credentials: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(providerAccountId);
    }
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Ran once",
      status: options.sandboxStatus,
      sandboxId: "sbx-session",
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
      ...(options.orphanAgentAgeMs !== undefined
        ? {
            backgroundAgents: [
              {
                toolUseId: "toolu_orphan",
                description: "explore the repo",
                status: "running",
                startedAt: now - options.orphanAgentAgeMs,
              },
            ],
          }
        : {}),
    });
    await ctx.db.insert("queuedMessages", {
      parentId: chatId,
      content: "and also rename the button",
      createdAt: now,
      order: now,
      userId,
      model: "claude:sonnet" as const,
      providerAccountId,
    });
    return { sessionId, chatId };
  });
  return { t, ...ids };
}

type TestConvex = Awaited<ReturnType<typeof fixture>>["t"];

function queueLength(t: TestConvex, chatId: Id<"sessionChats">) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", chatId))
      .collect();
    return rows.length;
  });
}

function scheduledDrains(t: TestConvex) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows.filter((row) => row.name.includes("drainQueueQuietly"));
  });
}

describe("a queued message is not stranded", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "subagents orphaned by a stopped sandbox do not stop the wake",
    async () => {
      const { t, sessionId, chatId } = await fixture({
        sandboxStatus: "closed",
        orphanAgentAgeMs: 10 * MINUTE_MS,
      });

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: chatId,
      });

      const session = await t.run((ctx) => ctx.db.get(sessionId));
      expect(session?.status).toBe("starting");
      expect(await queueLength(t, chatId)).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "the ready sandbox settles subagents the old VM never reported",
    async () => {
      const { t, sessionId, chatId } = await fixture({
        sandboxStatus: "starting",
        orphanAgentAgeMs: 10 * MINUTE_MS,
      });

      await t.mutation(internal._sessions.sandbox.sandboxReady, {
        sessionId,
        sandboxId: "sbx-session",
        branchName: "eva/session",
        isNew: false,
      });

      const chat = await t.run((ctx) => ctx.db.get(chatId));
      expect(chat?.backgroundAgents?.[0]?.status).toBe("stale");
    },
    TIMEOUT_MS,
  );

  test(
    "a message sent while stopping wakes Eva once the stop settles",
    async () => {
      const { t, sessionId, chatId } = await fixture({
        sandboxStatus: "stopping",
      });

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: chatId,
      });
      expect(await scheduledDrains(t)).toHaveLength(0);

      await t.mutation(internal._sessions.sandbox.markSandboxClosed, {
        sessionId,
      });
      expect(await scheduledDrains(t)).toHaveLength(1);

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: chatId,
      });
      const session = await t.run((ctx) => ctx.db.get(sessionId));
      expect(session?.status).toBe("starting");
      expect(await queueLength(t, chatId)).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "a deleted provider account consumes the message with an error",
    async () => {
      const { t, chatId } = await fixture({
        sandboxStatus: "active",
        deletedAccount: true,
      });

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: chatId,
      });

      expect(await queueLength(t, chatId)).toBe(0);
      const messages = await t.run((ctx) =>
        ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", chatId))
          .collect(),
      );
      expect(messages.map((message) => message.content)).toEqual([
        "Error: Provider account not found",
      ]);
    },
    TIMEOUT_MS,
  );
});
