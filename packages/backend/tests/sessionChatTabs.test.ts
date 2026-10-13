import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Closing a parallel chat and opening another must read "Chat 2" again (not
 * "Chat 3"), while `number` stays unique so old `?chat=N` links never point at
 * the new tab. A link to a closed chat opens Main: a closed chat has no tab
 * and no composer.
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
  return { asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("session chat tabs", () => {
  test(
    "a new chat reuses the lowest free label but never a used number",
    async () => {
      const f = await fixture();
      const first = await f.asUser.mutation(api._sessionChats.mutations.create, {
        sessionId: f.sessionId,
      });
      expect(first).toMatchObject({ title: "Chat 2", number: 2 });

      await f.asUser.mutation(api._sessionChats.mutations.archive, {
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
    "a link to a closed chat opens Main; an open chat link opens that chat",
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

      await f.asUser.mutation(api._sessionChats.mutations.archive, {
        chatId: side._id,
      });
      const closed = await f.asUser.query(
        api._sessionChats.queries.resolveForSession,
        { sessionId: f.sessionId, number: side.number },
      );
      expect(closed?._id).toBe(f.mainChatId);
    },
    TIMEOUT_MS,
  );
});
