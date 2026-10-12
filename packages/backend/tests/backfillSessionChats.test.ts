import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { ensureMainChat } from "../convex/_sessionChats/helpers";

/**
 * Heavy sessions hold transcripts over the 16 MiB per-function read limit.
 * The Main chat backfill moves them in bounded pages across mutations, runs
 * sessions one at a time, and costs little on a rerun.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

/** ~0.9 MB per message, so a few of them exceed one 2 MiB page. */
const BIG_CONTENT = "x".repeat(900_000);
const HEAVY_MESSAGES = 6;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|backfill" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const insertSession = async (title: string, messages: number) => {
      const sessionId = await ctx.db.insert("sessions", {
        repoId,
        userId,
        title,
        status: "active",
      });
      for (let i = 0; i < messages; i += 1) {
        await ctx.db.insert("messages", {
          parentId: sessionId,
          role: i % 2 === 0 ? "user" : "assistant",
          content: BIG_CONTENT,
          timestamp: i,
        });
      }
      await ctx.db.insert("queuedMessages", {
        parentId: sessionId,
        content: "queued",
        userId,
        createdAt: 1,
      });
      await ctx.db.insert("sessionDaemonStates", {
        sessionId,
        repoId,
        userId,
      });
      return sessionId;
    };
    const lightSessionId = await insertSession("Light", 2);
    const heavySessionId = await insertSession("Heavy", HEAVY_MESSAGES);
    return { lightSessionId, heavySessionId };
  });

  const transcriptState = (sessionId: Id<"sessions">) =>
    t.run(async (ctx) => {
      const chats = await ctx.db
        .query("sessionChats")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect();
      const legacyMessages = await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", sessionId))
        .collect();
      const mainChat = chats[0];
      const chatMessages =
        mainChat === undefined
          ? []
          : await ctx.db
              .query("messages")
              .withIndex("by_parent", (q) => q.eq("parentId", mainChat._id))
              .collect();
      const legacyQueued = await ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_order", (q) => q.eq("parentId", sessionId))
        .collect();
      const daemonStates = await ctx.db
        .query("sessionDaemonStates")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect();
      return {
        chats: chats.length,
        legacyMessages: legacyMessages.length,
        chatMessages: chatMessages.length,
        legacyQueued: legacyQueued.length,
        daemonStates: daemonStates.length,
      };
    });

  return { t, ...ids, transcriptState };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("backfillSessionChats", () => {
  test(
    "one step moves a bounded page of a heavy transcript",
    async () => {
      const f = await fixture();
      const done = await f.t.mutation(
        internal._migrations.backfillSessionChats.backfillSessionStep,
        { sessionId: f.heavySessionId },
      );
      expect(done).toBe(false);
      const state = await f.transcriptState(f.heavySessionId);
      expect(state.chats).toBe(1);
      expect(state.chatMessages).toBeGreaterThan(0);
      expect(state.legacyMessages).toBeGreaterThan(0);
      expect(state.daemonStates).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "migrates every session, and a rerun is a no-op",
    async () => {
      const f = await fixture();
      const first = await f.t.action(
        internal._migrations.backfillSessionChats.backfillSessionChats,
        {},
      );
      expect(first).toEqual({ processed: 2, failed: 0, done: true });

      const expected: Array<[Id<"sessions">, number]> = [
        [f.lightSessionId, 2],
        [f.heavySessionId, HEAVY_MESSAGES],
      ];
      for (const [sessionId, messages] of expected) {
        expect(await f.transcriptState(sessionId)).toEqual({
          chats: 1,
          legacyMessages: 0,
          chatMessages: messages,
          legacyQueued: 0,
          daemonStates: 0,
        });
      }

      const rerun = await f.t.action(
        internal._migrations.backfillSessionChats.backfillSessionChats,
        {},
      );
      expect(rerun).toEqual({ processed: 2, failed: 0, done: true });
      expect((await f.transcriptState(f.heavySessionId)).chats).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "ensureMainChat moves the rest of a heavy transcript in later mutations",
    async () => {
      vi.useFakeTimers();
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const session = await ctx.db.get(f.heavySessionId);
        if (!session) throw new Error("missing session");
        await ensureMainChat(ctx, session);
      });
      expect(
        (await f.transcriptState(f.heavySessionId)).legacyMessages,
      ).toBeGreaterThan(0);

      await f.t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await f.transcriptState(f.heavySessionId)).toMatchObject({
        chats: 1,
        legacyMessages: 0,
        chatMessages: HEAVY_MESSAGES,
        legacyQueued: 0,
      });
    },
    TIMEOUT_MS,
  );
});
