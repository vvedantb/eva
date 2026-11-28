import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, mock, test, vi } from "bun:test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import * as StallWatchdog from "../convex/_chat/stallWatchdog";
import { openSessionChatTurn } from "../convex/_chat/turnStore";
import { modules } from "./_helpers/convexModules";


const TIMEOUT_MS = 30_000;

const poison = {
  workflowId: "poisoned-workflow",
  throws: 0,
};

const actual = { ...StallWatchdog };
mock.module("../convex/_chat/stallWatchdog", () => {
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

beforeEach(() => {
  vi.useFakeTimers();
  poison.throws = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

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
        owner: { kind: "standalone" },
        repoId,
        userId,
        title: "Reconcile",
        status: "active",
      });
      const openExpiredTurn = async (
        leaseExpiresAt: number,
        workflowId?: string,
      ) => {
        const chatId = await ctx.db.insert("sessionChats", {
          sessionId,
          repoId,
          userId,
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
      const now = Date.now();
      return {
        poisonedTurnId: await openExpiredTurn(now - 2000, poison.workflowId),
        healthyTurnId: await openExpiredTurn(now - 1000),
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
