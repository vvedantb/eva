import workflow from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { openSessionChatTurn } from "../convex/_chat/turnStore";
import { MAX_PARALLEL_CHATS } from "../convex/_sessionChats/helpers";

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

// Keeps the scheduled stall retry from firing after the test finishes.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * The bug: `finalizeExpired` drained sibling chats before it closed the expired
 * turn. That turn still held a parallel-chat slot, so a sibling parked on the
 * cap stayed parked, and no later drain released it.
 */
test(
  "an expired turn frees its parallel-chat slot before siblings drain",
  async () => {
    const t = convexTest(schema, modules);
    workflow.register(t);
    const { expiredTurnId, parkedChatId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "eva",
        name: "parallel-slot-test",
        installationId: 1,
      });
      const sessionId = await ctx.db.insert("sessions", {
        repoId,
        userId,
        title: "Parallel chats",
        status: "active",
      });
      const openChat = async (number: number) => {
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
        return turnId;
      };
      // Every slot is taken; the first turn's lease has run out.
      const turnIds: Id<"turns">[] = [];
      for (let number = 1; number <= MAX_PARALLEL_CHATS; number++) {
        turnIds.push(await openChat(number));
      }
      const [expiredTurnId] = turnIds;
      if (expiredTurnId === undefined) throw new Error("no turn opened");
      await ctx.db.patch(expiredTurnId, {
        state: "running",
        leaseExpiresAt: Date.now() - 1,
      });
      const parkedChatId = await ctx.db.insert("sessionChats", {
        sessionId,
        repoId,
        userId,
        title: "Parked",
        number: MAX_PARALLEL_CHATS + 1,
        isMain: false,
      });
      await ctx.db.insert("queuedMessages", {
        parentId: parkedChatId,
        content: "parked on the cap",
        createdAt: Date.now(),
        order: Date.now(),
        userId,
        model: "claude:sonnet" as const,
      });
      return { expiredTurnId, parkedChatId };
    });

    await t.mutation(internal.turns.finalizeExpired, {
      turnId: expiredTurnId,
      cause: "process_dead",
    });

    const after = await t.run(async (ctx) => ({
      expired: await ctx.db.get(expiredTurnId),
      queued: await ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_order", (q) =>
          q.eq("parentId", parkedChatId),
        )
        .collect(),
      parkedTurns: await ctx.db
        .query("turns")
        .withIndex("by_entity_open", (q) => q.eq("entityId", parkedChatId))
        .collect(),
      parkedMessages: await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", parkedChatId))
        .collect(),
    }));
    expect(after.expired?.open).toBe(false);
    // The freed slot went to the parked sibling: its message started a turn.
    expect(after.queued).toHaveLength(0);
    expect(after.parkedTurns.filter((turn) => turn.open)).toHaveLength(1);
    expect(after.parkedMessages.map((message) => message.content)).toContain(
      "parked on the cap",
    );
  },
  TIMEOUT_MS,
);
