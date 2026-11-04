import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * A chat turn paused on a blocking question flags its session row, so the
 * sidebar can show the "?" mark. The flag clears once the user answers.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|awaiting-answer";

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
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Asks a question",
      status: "active",
      numId: 1,
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    await ctx.db.insert("turns", {
      entityId: chatId,
      sessionId,
      streamingEntityId: String(chatId),
      state: "running",
      open: true,
      turnStartedAt: Date.now(),
      leaseExpiresAt: Date.now() + 60_000,
      leaseGeneration: 1,
      model: "claude:sonnet",
      repoId,
    });
    return { repoId, sessionId, chatId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("session list isAwaitingAnswer", () => {
  test(
    "is set while a chat's question waits and clears once answered",
    async () => {
      const f = await fixture();
      const row = async () =>
        (await f.asUser.query(api.sessions.list, { repoId: f.repoId })).find(
          (item) => item._id === f.sessionId,
        );

      expect((await row())?.isAwaitingAnswer).toBe(false);
      expect((await row())?.isExecuting).toBe(true);

      await f.asUser.mutation(api.pendingQuestions.post, {
        entityId: f.chatId,
        toolUseId: "tool-1",
        payload: "{}",
      });
      expect((await row())?.isAwaitingAnswer).toBe(true);

      await f.asUser.mutation(api.pendingQuestions.answer, {
        entityId: f.chatId,
        toolUseId: "tool-1",
        answer: "yes",
      });
      expect((await row())?.isAwaitingAnswer).toBe(false);
    },
    TIMEOUT_MS,
  );
});
