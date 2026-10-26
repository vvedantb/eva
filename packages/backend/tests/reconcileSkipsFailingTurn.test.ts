import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { openSessionChatTurn } from "../convex/_chat/turnStore";

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const poison = vi.hoisted(() => ({
  workflowId: "poisoned-workflow",
  throws: 0,
}));

// Stands in for any mutation-level failure (in prod: a 16 MB read limit on an
// unbounded `backgroundAgents` array) on exactly one turn.
vi.mock("../convex/_chat/stallWatchdog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../convex/_chat/stallWatchdog")>();
  return {
    ...actual,
    finalizeStaleChatTurn: async (
      ...args: Parameters<typeof actual.finalizeStaleChatTurn>
    ) => {
      if (args[4] === poison.workflowId) {
        poison.throws++;
        throw new Error("finalize failed");
      }
      return await actual.finalizeStaleChatTurn(...args);
    },
  };
});

// Keeps the scheduled stall retry from firing after the test finishes.
beforeEach(() => {
  vi.useFakeTimers();
  poison.throws = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * The bug: `reconcile` let a throw from `finalizeExpired` escape. The batch is
 * ordered by lease expiry, so one turn that could not finalise blocked every
 * later expired turn on every watchdog cycle.
 */
test(
  "reconcile still finalises later turns when an earlier one throws",
  async () => {
    const t = convexTest(schema, modules);
    const { poisonedTurnId, healthyTurnId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "eva",
        name: "reconcile-test",
        installationId: 1,
      });
      const sessionId = await ctx.db.insert("sessions", {
        repoId,
        userId,
        title: "Reconcile",
        status: "active",
      });
      const openExpiredTurn = async (
        number: number,
        leaseExpiresAt: number,
        workflowId?: string,
      ) => {
        const chatId = await ctx.db.insert("sessionChats", {
          sessionId,
          repoId,
          userId,
          title: `Chat ${number}`,
          number,
          isMain: number === 1,
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
          prompt: "work",
          model: "claude:sonnet",
          repoId,
        });
        await ctx.db.patch(turnId, {
          state: "running",
          leaseExpiresAt,
          ...(workflowId !== undefined ? { workflowId } : {}),
        });
        return turnId;
      };
      // The poisoned turn expired first, so it heads the reconcile batch.
      const now = Date.now();
      return {
        poisonedTurnId: await openExpiredTurn(1, now - 2000, poison.workflowId),
        healthyTurnId: await openExpiredTurn(2, now - 1000),
      };
    });

    await t.action(internal.turns.reconcile, {});

    const after = await t.run(async (ctx) => ({
      poisoned: await ctx.db.get(poisonedTurnId),
      healthy: await ctx.db.get(healthyTurnId),
    }));
    expect(poison.throws).toBe(1);
    expect(after.poisoned?.open).toBe(true);
    expect(after.healthy?.open).toBe(false);
  },
  TIMEOUT_MS,
);
