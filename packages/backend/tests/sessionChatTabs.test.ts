import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Deleting a parallel chat and opening another must read "Chat 2" again (not
 * "Chat 3"), while `number` stays unique so old `?chat=N` links never point at
 * the new tab. A link to a deleted chat opens Main, and its messages go.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|session-chat-tabs";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    // No sandbox, so closing a chat schedules no daemon kill.
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Chat tabs",
      status: "active",
      numId: 1,
    });
    const mainChatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    return { sessionId, mainChatId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("session chat tabs", () => {
  // `remove` schedules the purge: fake timers hold it until a test drains it.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test(
    "a new chat reuses the lowest free label but never a used number",
    async () => {
      const f = await fixture();
      const first = await f.asUser.mutation(
        api._sessionChats.mutations.create,
        {
          sessionId: f.sessionId,
        },
      );
      expect(first).toMatchObject({ title: "Chat 2", number: 2 });

      await f.asUser.mutation(api._sessionChats.mutations.remove, {
        chatId: first._id,
      });
      const reopened = await f.asUser.mutation(
        api._sessionChats.mutations.create,
        { sessionId: f.sessionId },
      );
      expect(reopened).toMatchObject({ title: "Chat 2", number: 3 });

      const next = await f.asUser.mutation(api._sessionChats.mutations.create, {
        sessionId: f.sessionId,
      });
      expect(next).toMatchObject({ title: "Chat 3", number: 4 });
    },
    TIMEOUT_MS,
  );

  test(
    "a link to a deleted chat opens Main; an open chat link opens that chat",
    async () => {
      const f = await fixture();
      const side = await f.asUser.mutation(api._sessionChats.mutations.create, {
        sessionId: f.sessionId,
      });

      const open = await f.asUser.query(
        api._sessionChats.queries.resolveForSession,
        { sessionId: f.sessionId, number: side.number },
      );
      expect(open?._id).toBe(side._id);

      await f.t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          role: "user",
          content: "hello",
          timestamp: 0,
          parentId: side._id,
        });
      });
      await f.asUser.mutation(api._sessionChats.mutations.remove, {
        chatId: side._id,
      });
      await f.t.finishAllScheduledFunctions(vi.runAllTimers);
      const remaining = await f.t.run(async (ctx) =>
        ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", side._id))
          .collect(),
      );
      expect(remaining).toHaveLength(0);
      const closed = await f.asUser.query(
        api._sessionChats.queries.resolveForSession,
        { sessionId: f.sessionId, number: side.number },
      );
      expect(closed?._id).toBe(f.mainChatId);

      await expect(
        f.asUser.mutation(api._sessionChats.mutations.remove, {
          chatId: f.mainChatId,
        }),
      ).rejects.toThrow("Main chat");
    },
    TIMEOUT_MS,
  );
});
